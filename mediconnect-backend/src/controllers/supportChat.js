const crypto = require("crypto");
const db = require("../db");
const { emitToSupportTopic } = require("../realtime");
const { ApiError } = require("../middleware/errorHandler");

// GET /api/support-topics
async function listTopics(req, res, next) {
  try {
    const { rows } = await db.query("SELECT * FROM support_topics ORDER BY name");
    res.json({ topics: rows });
  } catch (err) { next(err); }
}

// Ensures the current user has a stable, anonymous alias within this topic —
// generated once and reused for every message they send here afterward.
// Nothing about the alias reveals the user's real name or account.
async function getOrCreateAlias(topicId, userId) {
  const existing = await db.query(
    "SELECT alias FROM support_aliases WHERE topic_id = $1 AND user_id = $2",
    [topicId, userId]
  );
  if (existing.rows[0]) return existing.rows[0].alias;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `Member${crypto.randomInt(1000, 9999)}`;
    try {
      const inserted = await db.query(
        "INSERT INTO support_aliases (topic_id, user_id, alias) VALUES ($1,$2,$3) RETURNING alias",
        [topicId, userId, candidate]
      );
      return inserted.rows[0].alias;
    } catch (err) {
      if (err.code !== "23505") throw err; // alias collision within this topic — retry
    }
  }
  throw new Error("Could not generate a unique alias — please try again.");
}

// GET /api/support-topics/:id/messages
async function listMessages(req, res, next) {
  try {
    const topicRes = await db.query("SELECT * FROM support_topics WHERE id = $1", [req.params.id]);
    if (!topicRes.rows[0]) throw new ApiError(404, "Topic not found.");

    const { rows } = await db.query(
      `SELECT sm.id, sm.body, sm.created_at, sm.user_id,
              COALESCE(sa.alias, 'Member') AS alias
       FROM support_messages sm
       LEFT JOIN support_aliases sa ON sa.topic_id = sm.topic_id AND sa.user_id = sm.user_id
       WHERE sm.topic_id = $1
       ORDER BY sm.created_at ASC
       LIMIT 200`,
      [req.params.id]
    );
    // Never expose which underlying account posted which message to the
    // client beyond "is this me" — the alias is the only identity shown.
    const myAlias = await getOrCreateAlias(req.params.id, req.user.id);
    const messages = rows.map((m) => ({
      id: m.id, body: m.body, createdAt: m.created_at,
      alias: m.alias, mine: m.user_id === req.user.id,
    }));
    res.json({ messages, myAlias });
  } catch (err) { next(err); }
}

// POST /api/support-topics/:id/messages  { body }
async function sendMessage(req, res, next) {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) throw new ApiError(400, "Message cannot be empty.");
    if (body.length > 2000) throw new ApiError(400, "Message is too long.");

    const topicRes = await db.query("SELECT * FROM support_topics WHERE id = $1", [req.params.id]);
    if (!topicRes.rows[0]) throw new ApiError(404, "Topic not found.");

    await getOrCreateAlias(req.params.id, req.user.id);
    const { rows } = await db.query(
      "INSERT INTO support_messages (topic_id, user_id, body) VALUES ($1,$2,$3) RETURNING id, body, created_at",
      [req.params.id, req.user.id, body.trim()]
    );
    // Broadcast with the sender's alias only — real-time push must uphold
    // the same anonymity guarantee as the REST history endpoint, which never
    // exposes which account sent a message. The client determines "is this
    // mine" by comparing the alias to its own, not by a broadcast user id.
    const alias = await getOrCreateAlias(req.params.id, req.user.id);
    emitToSupportTopic(req.params.id, "support-message", {
      id: rows[0].id, body: rows[0].body, createdAt: rows[0].created_at, alias,
    });
    res.status(201).json({ message: rows[0] });
  } catch (err) { next(err); }
}

module.exports = { listTopics, listMessages, sendMessage };
