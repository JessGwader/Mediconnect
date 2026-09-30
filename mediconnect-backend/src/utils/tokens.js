const jwt = require("jsonwebtoken");
const crypto = require("crypto");

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_TTL || "15m" }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

// A short-lived, single-purpose token issued between "password correct" and
// "2FA code correct" during login. Deliberately signed with a DIFFERENT
// secret (derived from, but not equal to, the access-token secret) and
// carries no role — so even if it leaked, it could never be used in place
// of a real access token against requireAuth, which only ever verifies
// tokens against JWT_ACCESS_SECRET.
function twoFactorSecret() {
  return process.env.JWT_2FA_SECRET
    || crypto.createHash("sha256").update(`${process.env.JWT_ACCESS_SECRET}:2fa-pending`).digest("hex");
}

function signTwoFactorPendingToken(user) {
  return jwt.sign({ sub: user.id, purpose: "2fa_pending" }, twoFactorSecret(), { expiresIn: "5m" });
}

function verifyTwoFactorPendingToken(token) {
  const payload = jwt.verify(token, twoFactorSecret());
  if (payload.purpose !== "2fa_pending") throw new Error("Not a 2FA pending token.");
  return payload;
}

// Refresh tokens are random opaque strings (not JWTs) — we store only their SHA-256
// hash in the database, so a leaked DB dump can't be replayed as a valid token.
function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  signTwoFactorPendingToken,
  verifyTwoFactorPendingToken,
};
