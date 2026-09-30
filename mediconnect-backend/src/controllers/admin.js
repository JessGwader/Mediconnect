const db = require("../db");
const { logAction } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");

const VALID_STATUSES = ["Active", "Suspended", "Disabled", "Pending Verification"];

// GET /api/admin/me/profile — an administrator's own profile
async function getMyProfile(req, res, next) {
  try {
    const { rows } = await db.query("SELECT id, name, email, phone FROM users WHERE id = $1", [req.user.id]);
    if (!rows[0]) throw new ApiError(404, "Profile not found.");
    res.json({ profile: rows[0] });
  } catch (err) { next(err); }
}

// PATCH /api/admin/me/profile  { name, phone } — deliberately narrow, same
// as the patient/doctor equivalents: email changes aren't self-service here.
async function updateMyProfile(req, res, next) {
  try {
    const { name, phone } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { values.push(name); fields.push(`name = $${values.length}`); }
    if (phone !== undefined) { values.push(phone || null); fields.push(`phone = $${values.length}`); }
    if (fields.length === 0) throw new ApiError(400, "No fields to update.");
    values.push(req.user.id);
    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(", ")}, updated_at = now() WHERE id = $${values.length} RETURNING id, name, email, phone`,
      values
    );
    await logAction(req.user, "Updated their own profile", "user", req.user.id);
    res.json({ profile: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/admin/users
async function listUsers(req, res, next) {
  try {
    const { rows } = await db.query(
      "SELECT id, name, email, role, specialty, status, suspended_until, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: rows });
  } catch (err) { next(err); }
}

// Role changes are intentionally NOT exposed here. A user's role is fixed at
// registration (Patient) and can only ever move Patient -> Doctor/Specialist
// through the doctor-application + admin-approval workflow in
// doctorApplications.js. There is deliberately no endpoint that lets an
// administrator set an arbitrary role on an existing account.

// PATCH /api/admin/users/:id/status  { status, until? }
// A Suspension is temporary and REQUIRES an end date/time — that's what
// makes it meaningfully different from Disabled (permanent, must be
// manually reactivated by an administrator). Once `until` passes, the
// account silently regains access on its next request/login — no admin
// action needed to lift it.
async function setUserStatus(req, res, next) {
  try {
    const { status, until } = req.body;
    if (!VALID_STATUSES.includes(status)) throw new ApiError(400, "Invalid status.");
    if (req.params.id === req.user.id && status !== "Active") {
      throw new ApiError(400, "You cannot suspend or disable your own account. Have another administrator do this.");
    }

    let suspendedUntil = null;
    if (status === "Suspended") {
      if (!until) throw new ApiError(400, "A suspension requires an end date/time.");
      suspendedUntil = new Date(until);
      if (isNaN(suspendedUntil.getTime()) || suspendedUntil.getTime() <= Date.now()) {
        throw new ApiError(400, "Suspension end date/time must be in the future.");
      }
    }

    const { rows } = await db.query(
      "UPDATE users SET status = $1, suspended_until = $2, updated_at = now() WHERE id = $3 RETURNING id, name, status, suspended_until",
      [status, suspendedUntil, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "User not found.");
    const label = status === "Suspended"
      ? `Suspended ${rows[0].name} until ${suspendedUntil.toISOString()}`
      : `Set ${rows[0].name} status to ${status}`;
    await logAction(req.user, label, "user", rows[0].id);
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/admin/audit-log
async function getAuditLog(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const { rows } = await db.query(
      "SELECT id, actor_name, action, target_type, target_id, created_at FROM audit_log ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    res.json({ entries: rows });
  } catch (err) { next(err); }
}

module.exports = { getMyProfile, updateMyProfile, listUsers, setUserStatus, getAuditLog };
