const path = require("path");
const fs = require("fs");
const db = require("../db");
const { logAction, notify } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");
const { UPLOAD_ROOT } = require("../utils/uploads");

async function patientOr404(patientId) {
  const { rows } = await db.query("SELECT * FROM patients WHERE id = $1", [patientId]);
  if (!rows[0]) throw new ApiError(404, "Patient not found.");
  return rows[0];
}

function assertAccess(req, patient) {
  if (["Doctor", "Specialist", "Administrator"].includes(req.user.role)) return;
  if (req.user.role === "Patient" && patient.user_id === req.user.id) return;
  throw new ApiError(403, "You do not have access to this patient's documents.");
}

async function list(req, res, next) {
  try {
    const patient = await patientOr404(req.params.patientId);
    assertAccess(req, patient);
    const { rows } = await db.query(
      "SELECT id, doc_type, file_name, uploaded_at FROM documents WHERE patient_id = $1 ORDER BY uploaded_at DESC",
      [patient.id]
    );
    res.json({ documents: rows });
  } catch (err) { next(err); }
}

// A clinician can upload to any patient's record. A Patient may only
// upload to their OWN record (e.g. sharing a photo/document with their
// care team) — never to someone else's.
async function create(req, res, next) {
  try {
    const patient = await patientOr404(req.params.patientId);
    if (req.user.role === "Patient" && patient.user_id !== req.user.id) {
      throw new ApiError(403, "You can only upload documents to your own record.");
    }
    if (!req.file) throw new ApiError(400, "No file uploaded.");
    const docType = req.user.role === "Patient" ? (req.body.docType || "Patient Upload") : (req.body.docType || "Hospital Document");
    const { rows } = await db.query(
      `INSERT INTO documents (patient_id, uploaded_by, doc_type, file_name, storage_path)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, doc_type, file_name, uploaded_at`,
      [patient.id, req.user.id, docType, req.file.originalname, req.file.filename]
    );
    await logAction(req.user, `Uploaded ${docType} for ${patient.name}`, "document", rows[0].id);
    if (req.user.role !== "Patient" && patient.user_id) {
      await notify(patient.user_id, `A new document was uploaded to your record: ${req.file.originalname}.`);
    }
    res.status(201).json({ document: rows[0] });
  } catch (err) { next(err); }
}

async function download(req, res, next) {
  try {
    const patient = await patientOr404(req.params.patientId);
    assertAccess(req, patient);
    const { rows } = await db.query(
      "SELECT * FROM documents WHERE id = $1 AND patient_id = $2",
      [req.params.id, patient.id]
    );
    const doc = rows[0];
    if (!doc) throw new ApiError(404, "Document not found.");
    const filePath = path.join(UPLOAD_ROOT, doc.storage_path);
    if (!fs.existsSync(filePath)) throw new ApiError(404, "File is no longer available in storage.");
    res.download(filePath, doc.file_name);
  } catch (err) { next(err); }
}

module.exports = { list, create, download };
