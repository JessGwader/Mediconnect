-- Every account (Patient, Doctor, Specialist, Administrator) can now store a
-- phone number, captured at registration. Nullable — existing accounts have
-- none until they add one via their profile page.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
