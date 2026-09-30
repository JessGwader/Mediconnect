const { verifyAccessToken } = require("../utils/tokens");
const db = require("../db");

// Verifies the JWT access token on every protected request and attaches req.user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required." });

  try {
    const payload = verifyAccessToken(token);
    // Re-check current status on every request so a suspended/disabled account
    // loses access immediately, not just at next token refresh.
    const { rows } = await db.query("SELECT id, name, role, status, suspended_until FROM users WHERE id = $1", [payload.sub]);
    let user = rows[0];
    if (user && user.status === "Suspended" && user.suspended_until && new Date(user.suspended_until) <= new Date()) {
      // A timed suspension that has run out lifts itself — no admin action needed.
      const reactivated = await db.query(
        "UPDATE users SET status = 'Active', suspended_until = NULL, updated_at = now() WHERE id = $1 RETURNING id, name, role, status",
        [user.id]
      );
      user = reactivated.rows[0];
    }
    if (!user || user.status !== "Active") {
      return res.status(403).json({ error: "Account is not active." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired access token." });
  }
}

// Usage: requireRole('Doctor', 'Specialist')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required." });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
