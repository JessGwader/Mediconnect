-- ============================================================= TWO-FACTOR AUTH
-- TOTP (RFC 6238), same algorithm Google Authenticator / Authy use — no
-- external SMS/email dependency at login time. totp_secret is only ever set
-- once a setup flow completes; totp_enabled stays false until the user
-- proves they can generate a valid code, so a half-finished setup can never
-- lock someone out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;

-- One-time recovery codes, issued when 2FA is enabled, for when the user
-- loses their authenticator device. Stored hashed, each usable exactly once.
CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_2fa_recovery_user ON two_factor_recovery_codes(user_id);
