const db = require("../db");
const { notify } = require("../middleware/audit");
const { emitToConversation } = require("../realtime");
const { ApiError } = require("../middleware/errorHandler");

async function resolveMyPatientId(userId) {
  const { rows } = await db.query("SELECT id FROM patients WHERE user_id = $1", [userId]);
  return rows[0]?.id || null;
}

// A conversation may only be created between a patient and a doctor who have
// an actual relationship — at least one appointment between them, ever.
// This is what "authorized specialist doctor" (spec section 6) is enforced by.
async function assertRelationshipExists(patientId, doctorId) {
  const { rows } = await db.query(
    "SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 LIMIT 1",
    [patientId, doctorId]
  );
  if (!rows[0]) {
    throw new ApiError(403, "You can only message a doctor/patient you have an appointment history with.");
  }
}

async function assertParticipant(conversation, user) {
  if (user.role === "Administrator") return; // read-only oversight, not used for sending in the UI
  if (user.role === "Patient") {
    const myPatientId = await resolveMyPatientId(user.id);
    if (conversation.patient_id !== myPatientId) throw new ApiError(403, "Not your conversation.");
  } else if (conversation.doctor_id !== user.id) {
    throw new ApiError(403, "Not your conversation.");
  }
}

// GET /api/conversations — list mine, with last message preview + unread count
async function list(req, res, next) {
  try {
    let where, params;
    if (req.user.role === "Patient") {
      const myPatientId = await resolveMyPatientId(req.user.id);
      where = "c.patient_id = $1"; params = [myPatientId];
    } else if (["Doctor", "Specialist"].includes(req.user.role)) {
      where = "c.doctor_id = $1"; params = [req.user.id];
    } else {
      where = "1=1"; params = [];
    }
    const { rows } = await db.query(
      `SELECT c.*, p.name AS patient_name, u.name AS doctor_name,
              (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id != $${params.length + 1}) AS unread_count
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       JOIN users u ON u.id = c.doctor_id
       WHERE ${where}
       ORDER BY c.created_at DESC`,
      [...params, req.user.id]
    );
    res.json({ conversations: rows });
  } catch (err) { next(err); }
}

// POST /api/conversations  { doctorId } (patient) or { patientId } (doctor) — gets or creates
async function getOrCreate(req, res, next) {
  try {
    let patientId, doctorId;
    if (req.user.role === "Patient") {
      patientId = await resolveMyPatientId(req.user.id);
      doctorId = req.body.doctorId;
    } else if (["Doctor", "Specialist"].includes(req.user.role)) {
      patientId = req.body.patientId;
      doctorId = req.user.id;
    } else {
      throw new ApiError(403, "Administrators cannot start conversations.");
    }
    if (!patientId || !doctorId) throw new ApiError(400, "patientId and doctorId are both required.");
    await assertRelationshipExists(patientId, doctorId);

    const existing = await db.query("SELECT * FROM conversations WHERE patient_id = $1 AND doctor_id = $2", [patientId, doctorId]);
    if (existing.rows[0]) return res.json({ conversation: existing.rows[0] });

    const { rows } = await db.query(
      "INSERT INTO conversations (patient_id, doctor_id) VALUES ($1,$2) RETURNING *",
      [patientId, doctorId]
    );
    res.status(201).json({ conversation: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/conversations/:id/messages
async function listMessages(req, res, next) {
  try {
    const convRes = await db.query("SELECT * FROM conversations WHERE id = $1", [req.params.id]);
    const conversation = convRes.rows[0];
    if (!conversation) throw new ApiError(404, "Conversation not found.");
    await assertParticipant(conversation, req.user);

    const { rows } = await db.query(
      `SELECT m.*, u.name AS sender_name, d.file_name AS attachment_name
       FROM messages m JOIN users u ON u.id = m.sender_id
       LEFT JOIN documents d ON d.id = m.attachment_document_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    // Mark the other party's messages as read now that I've fetched them.
    await db.query(
      "UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL",
      [req.params.id, req.user.id]
    );
    res.json({ messages: rows });
  } catch (err) { next(err); }
}

// POST /api/conversations/:id/attachments  (multipart/form-data: file)
// Uploads a photo/document to share inside this thread. It's filed onto the
// patient's document record (so it stays visible from their chart too, same
// as any other clinical document) but only either side of THIS conversation
// can upload here — unlike the clinician-facing /patients/:id/documents
// route, a patient can attach here without needing broader document access.
async function uploadAttachment(req, res, next) {
  try {
    const convRes = await db.query("SELECT * FROM conversations WHERE id = $1", [req.params.id]);
    const conversation = convRes.rows[0];
    if (!conversation) throw new ApiError(404, "Conversation not found.");
    await assertParticipant(conversation, req.user);
    if (!req.file) throw new ApiError(400, "No file uploaded.");

    const docType = req.user.role === "Patient" ? "Chat Attachment" : "Chat Attachment (from clinician)";
    const { rows } = await db.query(
      `INSERT INTO documents (patient_id, uploaded_by, doc_type, file_name, storage_path)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, doc_type, file_name, uploaded_at`,
      [conversation.patient_id, req.user.id, docType, req.file.originalname, req.file.filename]
    );
    res.status(201).json({ document: rows[0] });
  } catch (err) { next(err); }
}

// POST /api/conversations/:id/messages  { body, attachmentDocumentId? }
async function sendMessage(req, res, next) {
  try {
    const { body, attachmentDocumentId } = req.body;
    if (!body && !attachmentDocumentId) throw new ApiError(400, "Message must have text or an attachment.");

    const convRes = await db.query("SELECT * FROM conversations WHERE id = $1", [req.params.id]);
    const conversation = convRes.rows[0];
    if (!conversation) throw new ApiError(404, "Conversation not found.");
    await assertParticipant(conversation, req.user);

    const { rows } = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, body, attachment_document_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, body || null, attachmentDocumentId || null]
    );

    // Push to anyone with this conversation open right now; the recipient
    // still gets a durable notification below regardless of whether they're
    // actively viewing the thread (sockets are additive, not a replacement).
    emitToConversation(req.params.id, "message", { ...rows[0], sender_name: req.user.name });

    const recipientId = conversation.doctor_id === req.user.id
      ? (await db.query("SELECT user_id FROM patients WHERE id = $1", [conversation.patient_id])).rows[0]?.user_id
      : conversation.doctor_id;
    if (recipientId) await notify(recipientId, `New message from ${req.user.name}.`);

    res.status(201).json({ message: rows[0] });
  } catch (err) { next(err); }
}

module.exports = { list, getOrCreate, listMessages, uploadAttachment, sendMessage };
