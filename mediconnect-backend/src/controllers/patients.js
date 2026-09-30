const db = require("../db");
const { logAction } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");

// Resolve which patient row a request is allowed to see.
async function assertPatientAccess(req, patientId) {
  if (["Doctor", "Specialist", "Administrator"].includes(req.user.role)) return;
  // Patients may only access their own record.
  const { rows } = await db.query("SELECT user_id FROM patients WHERE id = $1", [patientId]);
  if (!rows[0] || rows[0].user_id !== req.user.id) {
    throw new ApiError(403, "You do not have access to this patient record.");
  }
}

// GET /api/patients — clinical queue.
// Administrators see every patient. A Doctor/Specialist only sees a patient
// once there's an actual clinical relationship: the patient has booked (or
// had) an appointment with them, or the patient was transferred to them.
// Merely being registered as a Patient is NOT enough to show up in a
// doctor's list.
async function list(req, res, next) {
  try {
    const q = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;

    if (req.user.role === "Administrator") {
      const { rows } = await db.query(
        q
          ? "SELECT * FROM patients WHERE LOWER(name) LIKE $1 ORDER BY name"
          : "SELECT * FROM patients ORDER BY name",
        q ? [q] : []
      );
      return res.json({ patients: rows });
    }

    const params = [req.user.id];
    let searchClause = "";
    if (q) {
      params.push(q);
      searchClause = ` AND LOWER(p.name) LIKE $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT DISTINCT p.* FROM patients p
       WHERE (
         EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.doctor_id = $1)
         OR EXISTS (SELECT 1 FROM transfers tr WHERE tr.patient_id = p.id AND tr.to_doctor_id = $1)
       )${searchClause}
       ORDER BY p.name`,
      params
    );
    res.json({ patients: rows });
  } catch (err) { next(err); }
}

// GET /api/patients/me — a patient's own record
async function getMine(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.phone FROM patients p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
      [req.user.id]
    );
    if (!rows[0]) throw new ApiError(404, "Patient record not found.");
    res.json({ patient: rows[0] });
  } catch (err) { next(err); }
}

// PATCH /api/patients/me — a patient editing their own profile.
// Deliberately narrow: name, dob, phone, and self-reported allergies only.
// mrn, status, and department stay system/clinician-controlled.
async function updateMine(req, res, next) {
  try {
    const { name, dob, allergies, phone } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { values.push(name); fields.push(`name = $${values.length}`); }
    if (dob !== undefined) { values.push(dob); fields.push(`dob = $${values.length}`); }
    if (allergies !== undefined) {
      if (!Array.isArray(allergies)) throw new ApiError(400, "allergies must be an array of strings.");
      values.push(allergies); fields.push(`allergies = $${values.length}`);
    }
    if (fields.length === 0 && phone === undefined) throw new ApiError(400, "No fields to update.");
    values.push(req.user.id);
    const { rows } = fields.length
      ? await db.query(
          `UPDATE patients SET ${fields.join(", ")}, updated_at = now() WHERE user_id = $${values.length} RETURNING *`,
          values
        )
      : await db.query("SELECT * FROM patients WHERE user_id = $1", [req.user.id]);
    if (!rows[0]) throw new ApiError(404, "Patient record not found.");
    if (phone !== undefined) {
      await db.query("UPDATE users SET phone = $1, updated_at = now() WHERE id = $2", [phone || null, req.user.id]);
      rows[0].phone = phone || null;
    }
    if (name) await db.query("UPDATE users SET name = $1, updated_at = now() WHERE id = $2", [name, req.user.id]);
    await logAction(req.user, "Updated their own profile", "patient", rows[0].id);
    res.json({ patient: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/patients/:id
async function getOne(req, res, next) {
  try {
    await assertPatientAccess(req, req.params.id);
    const { rows } = await db.query("SELECT * FROM patients WHERE id = $1", [req.params.id]);
    if (!rows[0]) throw new ApiError(404, "Patient not found.");
    res.json({ patient: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/patients/:id/transfer-package?transferId=...
// Bundles the full record for handoff — but only once a real transfer
// workflow row (see /api/transfers) has been Accepted or Completed, and only
// for the destination doctor or an administrator. This is what prevents
// medical information reaching a destination party before they're authorized
// (spec section 5).
async function getTransferPackage(req, res, next) {
  try {
    const patientId = req.params.id;
    const { transferId } = req.query;
    if (!transferId) throw new ApiError(400, "transferId query parameter is required.");

    const transferRes = await db.query(
      "SELECT * FROM transfers WHERE id = $1 AND patient_id = $2",
      [transferId, patientId]
    );
    const transfer = transferRes.rows[0];
    if (!transfer) throw new ApiError(404, "Transfer not found for this patient.");
    if (!["Accepted", "Completed"].includes(transfer.status)) {
      throw new ApiError(403, "This transfer has not yet been accepted — the record package is not available.");
    }
    const isDestination = transfer.to_doctor_id === req.user.id;
    const isAdmin = req.user.role === "Administrator";
    if (!isDestination && !isAdmin) throw new ApiError(403, "You are not the authorized recipient of this transfer.");

    const [patient, consultations, prescriptions, documents] = await Promise.all([
      db.query("SELECT * FROM patients WHERE id = $1", [patientId]),
      db.query("SELECT * FROM consultations WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY created_at", [patientId]),
      db.query("SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY prescribed_on", [patientId]),
      db.query("SELECT * FROM documents WHERE patient_id = $1 ORDER BY uploaded_at", [patientId]),
    ]);
    if (!patient.rows[0]) throw new ApiError(404, "Patient not found.");

    await logAction(req.user, `Accessed transfer record package for ${patient.rows[0].name}`, "transfer", transfer.id);

    res.json({
      patient: patient.rows[0],
      consultations: consultations.rows,
      prescriptions: prescriptions.rows,
      documents: documents.rows,
    });
  } catch (err) { next(err); }
}

module.exports = { assertPatientAccess, list, getMine, updateMine, getOne, getTransferPackage };
