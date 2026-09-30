-- A short professional bio a doctor can edit on their own profile
-- (separate from the one-time bio submitted with their verification application).
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
