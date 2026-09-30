-- ============================================================= MULTI-SPECIALTY
-- A Specialist's primary specialty stays on users.specialty_id (unchanged —
-- everything that already filters/searches by it keeps working). This table
-- adds room for ONE additional specialty, each with its own matriculation
-- (license) number, since a second specialty is still a separately licensed
-- qualification. Capped at 2 total per doctor via the unique constraint plus
-- an application-layer check (see routes/doctors.js).
CREATE TABLE IF NOT EXISTS doctor_specialties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty_id    UUID NOT NULL REFERENCES specialties(id),
  license_number  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, specialty_id)
);
CREATE INDEX IF NOT EXISTS idx_doctor_specialties_user ON doctor_specialties(user_id);

-- ============================================================= VERIFICATION DOCUMENT
-- Optional supporting document (license photo, diploma, ID) attached at
-- application time. Nullable — the applicant is never required to provide one.
ALTER TABLE doctor_applications ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id);
