-- Tracks whether a session was created with "Remember Me" so that token
-- rotation on /refresh can keep honoring the same session length instead of
-- silently shortening a remembered session back down on its next renewal.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS remember_me BOOLEAN NOT NULL DEFAULT false;
