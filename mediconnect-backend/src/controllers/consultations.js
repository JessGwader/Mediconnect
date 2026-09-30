const db = require("../db");
const { logAction, notify } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");

async function patientOr404(patientId) {
  const { rows } = await db.query("SELECT * FROM patients WHERE id = $1", [patientId]);
  if (!rows[0]) throw new ApiError(404, "Patient not found.");
  return rows[0];
}

// GET /api/patients/:patientId/consultations
async function list(req, res, next) {
  try {
    const patient = await patientOr404(req.params.patientId);
    if (req.user.role === "Patient" && patient.user_id !== req.user.id) {
      throw new ApiError(403, "You do not have access to this patient record.");
    }
    const { rows } = await db.query(
      "SELECT * FROM consultations WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
      [req.params.patientId]
    );
    res.json({ consultations: rows });
  } catch (err) { next(err); }
}

// POST /api/patients/:patientId/consultations — doctors/specialists only.
// Requires the core clinical fields the spec calls out before it can be saved.
async function create(req, res, next) {
  try {
    const patient = await patientOr404(req.params.patientId);
    const { symptoms, observations, diagnosis, vitals, medications, labs, imaging } = req.body;
    if (!symptoms || !observations) {
      throw new ApiError(400, "Symptoms and clinical observations are required to record a consultation.");
    }
    const { rows } = await db.query(
      `INSERT INTO consultations (patient_id, doctor_id, symptoms, observations, diagnosis, vitals, medications, labs, imaging)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        patient.id, req.user.id, symptoms, observations, diagnosis || null,
        JSON.stringify(vitals || {}), medications || [], labs || null, imaging || null,
      ]
    );
    await logAction(req.user, `Completed consultation for ${patient.name}`, "consultation", rows[0].id);
    if (patient.user_id) await notify(patient.user_id, "A new consultation has been recorded on your medical record.");
    res.status(201).json({ consultation: rows[0] });
  } catch (err) { next(err); }
}

// PATCH /api/patients/:patientId/consultations/:id — updates are logged, never silent.
async function update(req, res, next) {
  try {
    const patient = await patientOr404(req.params.patientId);
    const fields = ["symptoms", "observations", "diagnosis", "vitals", "medications", "labs", "imaging"];
    const updates = [];
    const values = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        values.push(f === "vitals" ? JSON.stringify(req.body[f]) : req.body[f]);
        updates.push(`${f} = $${values.length}`);
      }
    });
    if (updates.length === 0) throw new ApiError(400, "No fields to update.");
    values.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE consultations SET ${updates.join(", ")}, updated_at = now()
       WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`,
      values
    );
    if (!rows[0]) throw new ApiError(404, "Consultation not found.");
    await logAction(req.user, `Updated consultation for ${patient.name}`, "consultation", rows[0].id);
    res.json({ consultation: rows[0] });
  } catch (err) { next(err); }
}

// DELETE /api/patients/:patientId/consultations/:id — SOFT delete only.
// Medical records must never be permanently deleted, per the spec.
async function remove(req, res, next) {
  try {
    const patient = await patientOr404(req.params.patientId);
    const { rows } = await db.query(
      "UPDATE consultations SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id",
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Consultation not found or already removed.");
    await logAction(req.user, `Soft-deleted consultation for ${patient.name} (retained for audit)`, "consultation", rows[0].id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
