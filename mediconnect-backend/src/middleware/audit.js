const db = require("../db");
const { emitToUser } = require("../realtime");

// Every mutating action in the system calls this, per the "every modification
// must be logged" requirement. Never throws — a logging failure must not block
// the underlying clinical action, but it is reported to stderr for ops alerting.
async function logAction(actor, action, targetType = null, targetId = null) {
  try {
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [actor?.id || null, actor?.name || "System", action, targetType, targetId]
    );
  } catch (err) {
    console.error("Failed to write audit log entry:", err);
  }
}

// Every existing call site (appointments, transfers, payments, doctor
// applications, messages, ...) gets real-time push for free from this one
// change — the notification bell updates instantly instead of waiting for
// its next poll, with polling still there as a fallback if the socket is down.
async function notify(userId, message) {
  try {
    const { rows } = await db.query(
      `INSERT INTO notifications (user_id, message) VALUES ($1, $2) RETURNING id, message, read, created_at`,
      [userId, message]
    );
    emitToUser(userId, "notification", rows[0]);
  } catch (err) {
    console.error("Failed to write notification:", err);
  }
}

module.exports = { logAction, notify };
