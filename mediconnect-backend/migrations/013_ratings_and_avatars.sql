-- ============================================================= RATINGS
-- A patient may rate a doctor once per COMPLETED appointment — tied to a
-- specific appointment (not just "this doctor") so it can't be spammed
-- without ever having actually been seen, and so one relationship can
-- accumulate multiple honest ratings over multiple real visits.
CREATE TABLE IF NOT EXISTS doctor_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id)
);
CREATE INDEX IF NOT EXISTS idx_doctor_ratings_doctor ON doctor_ratings(doctor_id);

-- ============================================================= PROFILE PICTURE
-- Optional for every account type (patient, doctor, specialist, admin) —
-- never required. Served through an authenticated route rather than static
-- hosting, same pattern as clinical documents.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;
