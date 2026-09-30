const crypto = require("crypto");
const db = require("../db");
const { hashPassword, verifyPassword, isPasswordStrongEnough } = require("../utils/password");
const { signAccessToken, generateRefreshToken, hashToken, signTwoFactorPendingToken, verifyTwoFactorPendingToken } = require("../utils/tokens");
const { generateSecret, verifyToken: verifyTotpToken, otpauthUrl } = require("../utils/totp");
const { logAction } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");
const { sendMail, templates } = require("../services/emailService");

const REFRESH_COOKIE = "mc_refresh";
// Two real session lengths: a short one for normal logins, and a longer one
// only when the person explicitly checks "Remember Me". This isn't just a
// cookie flag — the refresh token's own server-side expiry differs too, so
// a short session can't be extended just by keeping the cookie around.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const REMEMBER_TTL_MS = (parseInt(process.env.JWT_REMEMBER_TTL_DAYS || "30", 10)) * 24 * 60 * 60 * 1000; // 30 days

function refreshCookieOptions(ttlMs, rememberMe) {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
  };
  // Persistent cookie only for "Remember Me"; otherwise a real session
  // cookie that the browser itself clears on close — no maxAge at all.
  if (rememberMe) opts.maxAge = ttlMs;
  return opts;
}

async function issueTokens(res, user, rememberMe = false) {
  const accessToken = signAccessToken(user);
  const { raw, hash } = generateRefreshToken();
  const ttlMs = rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, remember_me) VALUES ($1, $2, $3, $4)`,
    [user.id, hash, expiresAt, rememberMe]
  );
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions(ttlMs, rememberMe));
  return accessToken;
}

// POST /api/auth/register
// Registration form NEVER accepts a role — every new account is a Patient,
// per the requirement that only admins can promote users afterward.
async function register(req, res, next) {
  try {
    const { name, email, password, dob, gender, phone } = req.body;
    if (!name || !email || !password) throw new ApiError(400, "Name, email, and password are required.");
    if (!dob) throw new ApiError(400, "Date of birth is required.");
    if (!gender || !["Male", "Female"].includes(gender)) throw new ApiError(400, "Gender is required and must be Male or Female.");
    if (!isPasswordStrongEnough(password)) {
      throw new ApiError(400, "Password must be at least 6 characters long.");
    }
    const emailNorm = String(email).trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash, role, status, gender, phone)
         VALUES ($1, $2, $3, 'Patient', 'Active', $4, $5)
         RETURNING id, name, email, role, status, gender, phone`,
        [name, emailNorm, passwordHash, gender, phone || null]
      );
      const user = userResult.rows[0];
      const mrn = `MRN-${Math.floor(100000 + Math.random() * 900000)}`;
      await client.query(
        `INSERT INTO patients (user_id, mrn, name, dob, status) VALUES ($1, $2, $3, $4, 'Outpatient')`,
        [user.id, mrn, name, dob]
      );
      await client.query("COMMIT");
      await logAction(user, "Registered new account (Patient)", "user", user.id);

      // Real email verification: generate a random token, store only its
      // hash, and email the raw token as a link. Registration still
      // succeeds even if email sending fails (e.g. SMTP not configured yet)
      // — verification just won't complete until it's resent.
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await db.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval '24 hours')`,
        [user.id, tokenHash]
      );
      const verifyLink = `${process.env.CORS_ORIGIN || "http://localhost:5173"}/verify-email?token=${rawToken}`;
      await sendMail(user.email, "Verify your MediConnect account", templates.verifyEmail(user.name, verifyLink));

      res.status(201).json({ user });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const { rows } = await db.query(
      "SELECT id, name, email, password_hash, role, status, suspended_until, totp_enabled FROM users WHERE email = $1",
      [String(email).trim().toLowerCase()]
    );
    let user = rows[0];
    // Same generic error whether the email doesn't exist or the password is wrong —
    // avoids leaking which emails are registered.
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiError(401, "Invalid email or password.");
    }
    if (user.status === "Suspended" && user.suspended_until && new Date(user.suspended_until) <= new Date()) {
      const reactivated = await db.query(
        "UPDATE users SET status = 'Active', suspended_until = NULL, updated_at = now() WHERE id = $1 RETURNING id, name, email, password_hash, role, status, totp_enabled",
        [user.id]
      );
      user = reactivated.rows[0];
    }
    if (user.status !== "Active") {
      if (user.status === "Pending Verification") {
        throw new ApiError(403, "Your doctor application is still under review. You'll be able to sign in again once an administrator has made a decision — check your email for updates.");
      }
      if (user.status === "Suspended") {
        const until = new Date(user.suspended_until).toLocaleString();
        throw new ApiError(403, `Your account is suspended until ${until}. Contact an administrator if you believe this is a mistake.`);
      }
      throw new ApiError(403, `Account is ${user.status.toLowerCase()}. Contact an administrator.`);
    }

    if (user.totp_enabled) {
      // Password is correct, but we withhold real tokens until the second
      // factor checks out. The pending token carries no role and can't be
      // used against any protected route (see verifyTwoFactorPendingToken).
      const twoFactorToken = signTwoFactorPendingToken(user);
      await logAction(user, "Signed in with correct password — awaiting 2FA code");
      return res.json({ requires2FA: true, twoFactorToken, rememberMe: !!rememberMe });
    }

    const accessToken = await issueTokens(res, user, !!rememberMe);
    await logAction(user, rememberMe ? "Signed in (Remember Me)" : "Signed in");
    res.json({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) { next(err); }
}

// POST /api/auth/2fa/login-verify  { twoFactorToken, code }
// Second step of login once /login has responded with requires2FA: true.
// code may be a live 6-digit TOTP code OR one of the one-time recovery codes.
async function loginVerify2FA(req, res, next) {
  try {
    const { twoFactorToken, code, rememberMe } = req.body;
    if (!twoFactorToken || !code) throw new ApiError(400, "twoFactorToken and code are required.");

    let payload;
    try {
      payload = verifyTwoFactorPendingToken(twoFactorToken);
    } catch {
      throw new ApiError(401, "This sign-in attempt has expired. Please log in again.");
    }

    const { rows } = await db.query(
      "SELECT id, name, email, role, status, totp_secret, totp_enabled FROM users WHERE id = $1",
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.totp_enabled) throw new ApiError(401, "This sign-in attempt is no longer valid.");
    if (user.status !== "Active") throw new ApiError(403, `Account is ${user.status.toLowerCase()}. Contact an administrator.`);

    let ok = verifyTotpToken(user.totp_secret, code);
    if (!ok) {
      // Fall back to a recovery code — hash-compare against every unused
      // code rather than a direct lookup, since codes are stored hashed.
      const recoveryRes = await db.query(
        "SELECT id, code_hash FROM two_factor_recovery_codes WHERE user_id = $1 AND used_at IS NULL",
        [user.id]
      );
      const cleanCode = String(code).trim().toUpperCase();
      const match = recoveryRes.rows.find((r) => r.code_hash === hashToken(cleanCode));
      if (match) {
        await db.query("UPDATE two_factor_recovery_codes SET used_at = now() WHERE id = $1", [match.id]);
        await logAction(user, "Signed in using a 2FA recovery code");
        ok = true;
      }
    }
    if (!ok) throw new ApiError(401, "Invalid or expired code.");

    const accessToken = await issueTokens(res, user, !!rememberMe);
    await logAction(user, "Completed 2FA sign-in");
    res.json({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) { next(err); }
}

// POST /api/auth/refresh — rotates the refresh token on every use (reuse of an
// old token is treated as a signal of possible theft and revokes the chain).
async function refresh(req, res, next) {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new ApiError(401, "No refresh token provided.");
    const hash = hashToken(raw);

    const { rows } = await db.query(
      `SELECT rt.id, rt.user_id, rt.revoked, rt.expires_at, rt.remember_me, u.name, u.role, u.status
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [hash]
    );
    const record = rows[0];
    if (!record || record.revoked || new Date(record.expires_at) < new Date()) {
      throw new ApiError(401, "Refresh token is invalid or expired. Please log in again.");
    }
    if (record.status !== "Active") throw new ApiError(403, "Account is not active.");

    await db.query("UPDATE refresh_tokens SET revoked = true WHERE id = $1", [record.id]);
    const user = { id: record.user_id, name: record.name, role: record.role };
    // Keep honoring whatever "Remember Me" choice started this session —
    // rotation shouldn't silently shorten (or extend) it.
    const accessToken = await issueTokens(res, user, record.remember_me);
    res.json({ accessToken, user });
  } catch (err) { next(err); }
}

// POST /api/auth/logout
async function logout(req, res, next) {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      await db.query("UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1", [hashToken(raw)]);
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    await logAction(req.user, "Signed out");
    res.json({ success: true });
  } catch (err) { next(err); }
}

function getMe(req, res) { res.json({ user: req.user }); }

// ---- Two-factor authentication management (requires an active session) ----

function generateRecoveryCodes(count = 8) {
  // Human-typeable: 10 hex chars, grouped for readability (e.g. A1B2-C3D4-E5).
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
}

// GET /api/auth/2fa/status
async function get2FAStatus(req, res, next) {
  try {
    const { rows } = await db.query("SELECT totp_enabled FROM users WHERE id = $1", [req.user.id]);
    res.json({ enabled: !!rows[0]?.totp_enabled });
  } catch (err) { next(err); }
}

// POST /api/auth/2fa/setup — generates (or regenerates) a pending secret.
// Not enabled yet: the user must prove they can produce a valid code via
// /2fa/enable before totp_enabled ever flips to true.
async function setup2FA(req, res, next) {
  try {
    const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [req.user.id]);
    const secret = generateSecret();
    await db.query("UPDATE users SET totp_secret = $1, updated_at = now() WHERE id = $2", [secret, req.user.id]);
    res.json({ secret, otpauthUrl: otpauthUrl(secret, rows[0].email) });
  } catch (err) { next(err); }
}

// POST /api/auth/2fa/enable  { code } — confirms the code from /setup works,
// flips totp_enabled on, and issues one-time recovery codes (shown once).
async function enable2FA(req, res, next) {
  try {
    const { code } = req.body;
    const { rows } = await db.query("SELECT totp_secret FROM users WHERE id = $1", [req.user.id]);
    const secret = rows[0]?.totp_secret;
    if (!secret) throw new ApiError(400, "Call /api/auth/2fa/setup first.");
    if (!verifyTotpToken(secret, code)) throw new ApiError(400, "That code didn't match. Check your authenticator app and try again.");

    await db.query("UPDATE users SET totp_enabled = true, updated_at = now() WHERE id = $1", [req.user.id]);
    await db.query("DELETE FROM two_factor_recovery_codes WHERE user_id = $1", [req.user.id]);
    const codes = generateRecoveryCodes();
    for (const c of codes) {
      await db.query(
        "INSERT INTO two_factor_recovery_codes (user_id, code_hash) VALUES ($1, $2)",
        [req.user.id, hashToken(c)]
      );
    }
    await logAction(req.user, "Enabled two-factor authentication");
    res.json({ success: true, recoveryCodes: codes });
  } catch (err) { next(err); }
}

// POST /api/auth/2fa/disable  { password } — requires re-entering the
// account password so a hijacked-but-still-logged-in session can't quietly
// turn 2FA off.
async function disable2FA(req, res, next) {
  try {
    const { password } = req.body;
    if (!password) throw new ApiError(400, "Password is required to disable two-factor authentication.");
    const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    if (!(await verifyPassword(password, rows[0].password_hash))) throw new ApiError(401, "Incorrect password.");

    await db.query("UPDATE users SET totp_enabled = false, totp_secret = NULL, updated_at = now() WHERE id = $1", [req.user.id]);
    await db.query("DELETE FROM two_factor_recovery_codes WHERE user_id = $1", [req.user.id]);
    await logAction(req.user, "Disabled two-factor authentication");
    res.json({ success: true });
  } catch (err) { next(err); }
}

// POST /api/auth/change-password  { currentPassword, newPassword }
// Used from a profile page — unlike reset-password, this requires the
// caller to already be authenticated AND know their current password.
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new ApiError(400, "Current and new password are both required.");
    if (!isPasswordStrongEnough(newPassword)) {
      throw new ApiError(400, "Password must be at least 6 characters long.");
    }
    const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      throw new ApiError(401, "Current password is incorrect.");
    }
    const newHash = await hashPassword(newPassword);
    await db.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [newHash, req.user.id]);
    await db.query("UPDATE refresh_tokens SET revoked = true WHERE user_id = $1", [req.user.id]);
    await logAction(req.user, "Changed their own password");
    res.json({ success: true });
  } catch (err) { next(err); }
}

// POST /api/auth/verify-email  { token }
async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) throw new ApiError(400, "Verification token is required.");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const { rows } = await db.query(
      "SELECT * FROM email_verification_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
      [tokenHash]
    );
    const record = rows[0];
    if (!record) throw new ApiError(400, "This verification link is invalid or has expired.");

    await db.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [record.user_id]);
    await db.query("UPDATE email_verification_tokens SET used_at = now() WHERE id = $1", [record.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// POST /api/auth/request-password-reset  { email }
// Always returns the same generic response whether or not the email exists,
// so this endpoint can't be used to enumerate registered accounts.
async function requestPasswordReset(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email is required.");
    const { rows } = await db.query("SELECT id, name, email FROM users WHERE email = $1", [String(email).trim().toLowerCase()]);
    const user = rows[0];
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval '1 hour')`,
        [user.id, tokenHash]
      );
      const resetLink = `${process.env.CORS_ORIGIN || "http://localhost:5173"}/reset-password?token=${rawToken}`;
      await sendMail(user.email, "Reset your MediConnect password", templates.passwordReset(user.name, resetLink));
    }
    res.json({ message: "If that email is registered, a password reset link has been sent." });
  } catch (err) { next(err); }
}

// POST /api/auth/reset-password  { token, newPassword }
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) throw new ApiError(400, "Token and newPassword are required.");
    if (!isPasswordStrongEnough(newPassword)) {
      throw new ApiError(400, "Password must be at least 6 characters long.");
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const { rows } = await db.query(
      "SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
      [tokenHash]
    );
    const record = rows[0];
    if (!record) throw new ApiError(400, "This reset link is invalid or has expired.");

    const passwordHash = await hashPassword(newPassword);
    await db.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [passwordHash, record.user_id]);
    await db.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [record.id]);
    // Invalidate all existing sessions for this user as a security measure.
    await db.query("UPDATE refresh_tokens SET revoked = true WHERE user_id = $1", [record.user_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = {
  register, login, loginVerify2FA, refresh, logout, getMe,
  get2FAStatus, setup2FA, enable2FA, disable2FA,
  changePassword, verifyEmail, requestPasswordReset, resetPassword,
};
