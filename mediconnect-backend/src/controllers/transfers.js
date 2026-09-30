const db = require("../db");
const { logAction, notify } = require("../middleware/audit");
const { sendMail, templates } = require("../services/emailService");
const { startDocument, footer } = require("../services/pdfService");
const { ApiError } = require("../middleware/errorHandler");

async function patientOr404(patientId) {
  const { rows } = await db.query("SELECT * FROM patients WHERE id = $1", [patientId]);
  if (!rows[0]) throw new ApiError(404, "Patient not found.");
  return rows[0];
}

function scopedTransferQuery(user) {
  if (user.role === "Administrator") return { clause: "1=1", params: [] };
  if (user.role === "Doctor" || user.role === "Specialist") {
    return { clause: "(t.from_doctor_id = $1 OR t.to_doctor_id = $1)", params: [user.id] };
  }
  return { clause: "p.user_id = $1", params: [user.id] }; // Patient: only their own
}

// GET /api/transfers — scoped to what the caller is allowed to see
async function list(req, res, next) {
  try {
    const { clause, params } = scopedTransferQuery(req.user);
    const { rows } = await db.query(
      `SELECT t.*, p.name AS patient_name,
              fd.name AS from_doctor_name, td.name AS to_doctor_name, c.name AS to_clinic_name
       FROM transfers t
       JOIN patients p ON p.id = t.patient_id
       LEFT JOIN users fd ON fd.id = t.from_doctor_id
       LEFT JOIN users td ON td.id = t.to_doctor_id
       LEFT JOIN clinics c ON c.id = t.to_clinic_id
       WHERE ${clause}
       ORDER BY t.created_at DESC`,
      params
    );
    res.json({ transfers: rows });
  } catch (err) { next(err); }
}

// POST /api/transfers  { patientId, toDoctorId?, toClinicId?, reason }
// Doctors/specialists request a transfer; it starts "Requested" and needs
// acceptance by the destination doctor (or an administrator) before it's real.
async function create(req, res, next) {
  try {
    const { patientId, toDoctorId, toClinicId, reason } = req.body;
    if (!reason || (!toDoctorId && !toClinicId)) {
      throw new ApiError(400, "A reason and either a destination doctor or clinic are required.");
    }
    const patient = await patientOr404(patientId);

    const { rows } = await db.query(
      `INSERT INTO transfers (patient_id, requested_by, from_doctor_id, to_doctor_id, to_clinic_id, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Requested') RETURNING *`,
      [patient.id, req.user.id, req.user.id, toDoctorId || null, toClinicId || null, reason]
    );
    await logAction(req.user, `Requested transfer of ${patient.name}`, "transfer", rows[0].id);
    if (toDoctorId) await notify(toDoctorId, `${req.user.name} requested to transfer patient ${patient.name} to you.`);
    if (patient.user_id) {
      await notify(patient.user_id, "A transfer request has been created for your care.");
      const userRes = await db.query("SELECT email, name FROM users WHERE id = $1", [patient.user_id]);
      if (userRes.rows[0]) {
        await sendMail(userRes.rows[0].email, "Transfer request created",
          templates.transferNotice(userRes.rows[0].name, `Dr. ${req.user.name} has requested to transfer your care. You'll be notified once it's confirmed.`));
      }
    }
    res.status(201).json({ transfer: rows[0] });
  } catch (err) { next(err); }
}

// PATCH /api/transfers/:id  { status: 'Accepted'|'Rejected'|'Completed'|'Cancelled' }
// Only the destination doctor or an administrator can accept/reject/complete.
async function update(req, res, next) {
  try {
    const { status } = req.body;
    const valid = ["Accepted", "Rejected", "Completed", "Cancelled"];
    if (!valid.includes(status)) throw new ApiError(400, "Invalid status.");

    const existing = await db.query("SELECT * FROM transfers WHERE id = $1", [req.params.id]);
    const transfer = existing.rows[0];
    if (!transfer) throw new ApiError(404, "Transfer not found.");

    const isDestinationDoctor = transfer.to_doctor_id === req.user.id;
    const isAdmin = req.user.role === "Administrator";
    const isRequester = transfer.requested_by === req.user.id;
    if (!isDestinationDoctor && !isAdmin && !(isRequester && status === "Cancelled")) {
      throw new ApiError(403, "You are not authorized to update this transfer.");
    }

    const { rows } = await db.query(
      "UPDATE transfers SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );

    if (status === "Completed") {
      await db.query("UPDATE patients SET status = 'Transferred', updated_at = now() WHERE id = $1", [transfer.patient_id]);
    }

    const patientRes = await db.query("SELECT name, user_id FROM patients WHERE id = $1", [transfer.patient_id]);
    const patient = patientRes.rows[0];
    await logAction(req.user, `Set transfer status to ${status} for ${patient?.name || "patient"}`, "transfer", transfer.id);
    if (patient?.user_id) await notify(patient.user_id, `Your transfer request is now: ${status}.`);

    res.json({ transfer: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/transfers/:id/referral-letter — real downloadable referral
// letter, authored by the requesting doctor. Available to the requester,
// the patient involved, the destination doctor (once named), or an admin —
// it doesn't require destination acceptance, since it IS the referral request.
async function downloadReferralLetter(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT t.*, p.name AS patient_name, p.mrn, p.dob,
              fd.name AS from_doctor_name, td.name AS to_doctor_name, c.name AS to_clinic_name,
              p.user_id AS patient_user_id
       FROM transfers t
       JOIN patients p ON p.id = t.patient_id
       LEFT JOIN users fd ON fd.id = t.from_doctor_id
       LEFT JOIN users td ON td.id = t.to_doctor_id
       LEFT JOIN clinics c ON c.id = t.to_clinic_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    const transfer = rows[0];
    if (!transfer) throw new ApiError(404, "Transfer not found.");

    const isAuthorized =
      req.user.role === "Administrator" ||
      transfer.requested_by === req.user.id ||
      transfer.to_doctor_id === req.user.id ||
      transfer.patient_user_id === req.user.id;
    if (!isAuthorized) throw new ApiError(403, "You are not authorized to view this referral letter.");

    const doc = startDocument(res, { filename: `referral-letter-${transfer.id}.pdf`, subtitle: "Referral Letter" });
    doc.text(`Date: ${String(transfer.created_at).slice(0, 10)}`);
    doc.text(`Patient: ${transfer.patient_name}${transfer.mrn ? " (" + transfer.mrn + ")" : ""}`);
    if (transfer.dob) doc.text(`Date of birth: ${String(transfer.dob).slice(0, 10)}`);
    doc.moveDown(1);
    doc.text(`Referring doctor: ${transfer.from_doctor_name || "—"}`);
    doc.text(`Referred to: ${transfer.to_doctor_name || transfer.to_clinic_name || "—"}`);
    doc.text(`Status: ${transfer.status}`);
    doc.moveDown(1);
    doc.fontSize(11).fillColor("#12233B").text("Reason for referral:");
    doc.fontSize(10).fillColor("#1B2A22").text(transfer.reason);
    footer(doc, "This referral letter was generated by MediConnect and reflects the referring doctor's record at the time of the request.");
    doc.end();
  } catch (err) { next(err); }
}

module.exports = { list, create, update, downloadReferralLetter };
