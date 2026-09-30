const db = require("../db");
const { logAction, notify } = require("../middleware/audit");
const { sendMail, templates } = require("../services/emailService");
const { ApiError } = require("../middleware/errorHandler");

// POST /api/doctor-applications  (multipart/form-data: doctorType, specialtyId, clinicId, licenseNumber, bio, document?)
// Any logged-in Patient can apply — this NEVER changes their role by itself.
// `document` is an OPTIONAL supporting file (license photo, diploma, ID) —
// never required to submit.
async function create(req, res, next) {
  try {
    const { doctorType, specialtyId, clinicId, licenseNumber, bio } = req.body;
    if (!licenseNumber) throw new ApiError(400, "A professional license number is required.");
    if (!["Generalist", "Specialist"].includes(doctorType)) {
      throw new ApiError(400, "doctorType must be either Generalist or Specialist.");
    }
    if (doctorType === "Specialist" && !specialtyId) {
      throw new ApiError(400, "Specialists must select a specialty.");
    }

    // A doctor must be at least 21 — checked against the same dob collected
    // at account registration (every user gets a patients row with a dob).
    const dobRes = await db.query("SELECT dob FROM patients WHERE user_id = $1", [req.user.id]);
    const dob = dobRes.rows[0]?.dob;
    if (!dob) throw new ApiError(400, "A date of birth is required on file before applying as a doctor.");
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.2425 * 24 * 60 * 60 * 1000));
    if (age < 21) throw new ApiError(400, "You must be at least 21 years old to register as a doctor.");

    const existing = await db.query(
      "SELECT id FROM doctor_applications WHERE user_id = $1 AND status = 'Pending'",
      [req.user.id]
    );
    if (existing.rows[0]) throw new ApiError(409, "You already have a pending application.");

    // A Generalist is auto-tagged to "General Medicine" so they still show
    // up correctly in the same specialty search/filter as everyone else —
    // the applicant never picks a specialty in this case.
    let finalSpecialtyId = specialtyId || null;
    if (doctorType === "Generalist") {
      const generalMed = await db.query("SELECT id FROM specialties WHERE name = 'General Medicine' LIMIT 1");
      finalSpecialtyId = generalMed.rows[0]?.id || null;
    }

    const { rows } = await db.query(
      `INSERT INTO doctor_applications (user_id, doctor_type, specialty_id, clinic_id, license_number, bio)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, doctorType, finalSpecialtyId, clinicId || null, licenseNumber, bio || null]
    );

    // Optional supporting document — filed under the applicant's own
    // (still-Patient) record, then linked back onto the application.
    if (req.file) {
      const myPatient = await db.query("SELECT id FROM patients WHERE user_id = $1", [req.user.id]);
      if (myPatient.rows[0]) {
        const docRes = await db.query(
          `INSERT INTO documents (patient_id, uploaded_by, doc_type, file_name, storage_path)
           VALUES ($1,$2,'Doctor Verification',$3,$4) RETURNING id`,
          [myPatient.rows[0].id, req.user.id, req.file.originalname, req.file.filename]
        );
        await db.query("UPDATE doctor_applications SET document_id = $1 WHERE id = $2", [docRes.rows[0].id, rows[0].id]);
        rows[0].document_id = docRes.rows[0].id;
      }
    }

    // The applicant loses normal account access the instant they submit —
    // requireAuth re-checks status on every request, so this alone is
    // enough to lock them out of the patient dashboard, booking, messaging,
    // everywhere, until an administrator decides. Revoking their refresh
    // tokens too means even a lingering browser tab can't silently refresh
    // its way back in.
    await db.query("UPDATE users SET status = 'Pending Verification', updated_at = now() WHERE id = $1", [req.user.id]);
    await db.query("UPDATE refresh_tokens SET revoked = true WHERE user_id = $1", [req.user.id]);

    const applicantRes = await db.query("SELECT name, email FROM users WHERE id = $1", [req.user.id]);
    const applicant = applicantRes.rows[0];
    await sendMail(applicant.email, "Application received", templates.doctorApplicationReceived(applicant.name));

    await logAction(req.user, `Submitted a doctor verification application (${doctorType})`, "doctor_application", rows[0].id);
    res.status(201).json({ application: rows[0], accountPending: true });
  } catch (err) { next(err); }
}

// GET /api/doctor-applications/me — check my own application status
async function getMine(req, res, next) {
  try {
    const { rows } = await db.query(
      "SELECT * FROM doctor_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.id]
    );
    res.json({ application: rows[0] || null });
  } catch (err) { next(err); }
}

// GET /api/doctor-applications — admin queue
async function list(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT a.*, u.name, u.email, s.name AS specialty_name, c.name AS clinic_name,
              p.id AS applicant_patient_id, d.file_name AS document_file_name
       FROM doctor_applications a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN specialties s ON s.id = a.specialty_id
       LEFT JOIN clinics c ON c.id = a.clinic_id
       LEFT JOIN patients p ON p.user_id = a.user_id
       LEFT JOIN documents d ON d.id = a.document_id
       ORDER BY a.created_at DESC`
    );
    res.json({ applications: rows });
  } catch (err) { next(err); }
}

// PATCH /api/doctor-applications/:id  { status: 'Approved'|'Rejected' }
// Approval is the ONLY path that promotes a Patient to Doctor — and it still
// requires an administrator to click it, same as any other role change.
async function decide(req, res, next) {
  try {
    const { status } = req.body;
    if (!["Approved", "Rejected"].includes(status)) throw new ApiError(400, "Invalid status.");

    const existing = await db.query("SELECT * FROM doctor_applications WHERE id = $1", [req.params.id]);
    const application = existing.rows[0];
    if (!application) throw new ApiError(404, "Application not found.");

    const { rows } = await db.query(
      "UPDATE doctor_applications SET status = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3 RETURNING *",
      [status, req.user.id, req.params.id]
    );

    const userRes = await db.query("SELECT id, name, email FROM users WHERE id = $1", [application.user_id]);
    const applicant = userRes.rows[0];

    if (status === "Approved") {
      const finalRole = application.doctor_type === "Specialist" ? "Specialist" : "Doctor";
      await db.query(
        "UPDATE users SET role = $1, specialty_id = $2, clinic_id = $3, status = 'Active', updated_at = now() WHERE id = $4",
        [finalRole, application.specialty_id, application.clinic_id, application.user_id]
      );
      await notify(application.user_id, `Your doctor verification was approved — you now have ${finalRole} access.`);
      await sendMail(applicant.email, "Doctor account verified", templates.doctorApplicationApproved(applicant.name, finalRole));
    } else {
      // Rejected — restore normal account access as a Patient (the role was
      // never changed in the first place) rather than leaving them locked
      // out indefinitely.
      await db.query("UPDATE users SET status = 'Active', updated_at = now() WHERE id = $1", [application.user_id]);
      await notify(application.user_id, "Your doctor verification application was not approved. You can still use your account as a patient, or contact an administrator for details.");
      await sendMail(applicant.email, "Update on your doctor verification application", templates.doctorApplicationRejected(applicant.name));
    }

    await logAction(req.user, `${status} doctor application for ${applicant?.name || "user"}`, "doctor_application", application.id);
    res.json({ application: rows[0] });
  } catch (err) { next(err); }
}

module.exports = { create, getMine, list, decide };
