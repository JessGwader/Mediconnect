const path = require("path");
const fs = require("fs");
const db = require("../db");
const { logAction } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");
const { UPLOAD_ROOT } = require("../utils/uploads");

const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

// POST /api/users/me/avatar  (multipart/form-data: file) — optional for
// every role. Replaces any previous avatar; the old file is deleted so
// storage doesn't grow unbounded from repeated changes.
async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) throw new ApiError(400, "No file uploaded.");
    if (!IMAGE_MIME.has(req.file.mimetype)) throw new ApiError(400, "Profile picture must be a PNG, JPEG, or WebP image.");

    const oldRes = await db.query("SELECT avatar_path FROM users WHERE id = $1", [req.user.id]);
    const oldPath = oldRes.rows[0]?.avatar_path;

    await db.query("UPDATE users SET avatar_path = $1, updated_at = now() WHERE id = $2", [req.file.filename, req.user.id]);

    if (oldPath) {
      const fullOldPath = path.join(UPLOAD_ROOT, oldPath);
      fs.unlink(fullOldPath, () => {}); // best-effort cleanup, never blocks the response
    }

    await logAction(req.user, "Updated their profile picture");
    res.status(201).json({ hasAvatar: true });
  } catch (err) { next(err); }
}

// DELETE /api/users/me/avatar — remove it, going back to the default look.
async function removeAvatar(req, res, next) {
  try {
    const { rows } = await db.query("SELECT avatar_path FROM users WHERE id = $1", [req.user.id]);
    const oldPath = rows[0]?.avatar_path;
    await db.query("UPDATE users SET avatar_path = NULL, updated_at = now() WHERE id = $1", [req.user.id]);
    if (oldPath) fs.unlink(path.join(UPLOAD_ROOT, oldPath), () => {});
    res.json({ hasAvatar: false });
  } catch (err) { next(err); }
}

// GET /api/users/:id/avatar — served to any authenticated user (profile
// pictures aren't clinical data; a patient needs to see a doctor's photo on
// the booking card, for instance). 404s cleanly if none is set so the
// frontend can fall back to a default icon.
async function getAvatar(req, res, next) {
  try {
    const { rows } = await db.query("SELECT avatar_path FROM users WHERE id = $1", [req.params.id]);
    const avatarPath = rows[0]?.avatar_path;
    if (!avatarPath) throw new ApiError(404, "No profile picture set.");
    const fullPath = path.join(UPLOAD_ROOT, avatarPath);
    if (!fs.existsSync(fullPath)) throw new ApiError(404, "No profile picture set.");
    res.sendFile(fullPath, (err) => { if (err && !res.headersSent) next(err); });
  } catch (err) { next(err); }
}

module.exports = { uploadAvatar, removeAvatar, getAvatar };
