const db = require("../db");

// GET /api/notifications — the frontend polls this (e.g. every 15-30s) for a
// simple, dependency-free "real-time" experience without needing a websocket
// server. Swap in Socket.IO or Postgres LISTEN/NOTIFY for true push delivery.
async function list(req, res, next) {
  try {
    const { rows } = await db.query(
      "SELECT id, message, read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );
    res.json({ notifications: rows });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    await db.query("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, markRead };
