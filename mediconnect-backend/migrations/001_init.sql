-- MediConnect initial schema
-- Run with: psql "$DATABASE_URL" -f migrations/001_init.sql
-- (or via `npm run migrate`, which runs every .sql file in /migrations in order)

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ============================================================= USERS
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'Patient'
                    CHECK (role IN ('Patient','Doctor','Specialist','Administrator')),
  specialty       TEXT,
  status          TEXT NOT NULL DEFAULT 'Active'
                    CHECK (status IN ('Active','Suspended','Disabled','Pending Verification')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================= REFRESH TOKENS
-- Stored hashed and rotated on every use; supports revocation (logout / compromise).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

-- ============================================================= PATIENTS
CREATE TABLE IF NOT EXISTS patients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  mrn           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  dob           DATE,
  department    TEXT,
  status        TEXT NOT NULL DEFAULT 'Outpatient'
                  CHECK (status IN ('Outpatient','Admitted','Discharged','Transferred')),
  allergies     TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================= CONSULTATIONS (medical records)
-- Never hard-deleted: deleted_at supports soft delete only. Every write is audit-logged
-- by the application layer (see src/middleware/audit.js).
CREATE TABLE IF NOT EXISTS consultations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  symptoms      TEXT NOT NULL,
  observations  TEXT NOT NULL,
  diagnosis     TEXT,
  vitals        JSONB NOT NULL DEFAULT '{}',
  medications   TEXT[] NOT NULL DEFAULT '{}',
  labs          TEXT,
  imaging       TEXT,
  ai_summary    JSONB,               -- populated only by POST /ai-analysis, never auto-written elsewhere
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_consult_patient ON consultations(patient_id);

-- ============================================================= PRESCRIPTIONS
CREATE TABLE IF NOT EXISTS prescriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  medication     TEXT NOT NULL,
  prescribed_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  status         TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Discontinued')),
  override_ack   BOOLEAN NOT NULL DEFAULT false, -- true if a doctor overrode a safety warning
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_id);

-- ============================================================= APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_date   DATE NOT NULL,
  scheduled_time   TIME NOT NULL,
  status           TEXT NOT NULL DEFAULT 'Pending'
                     CHECK (status IN ('Pending','Confirmed','Rejected','Rescheduled','Completed','Cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);

-- ============================================================= DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  uploaded_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  doc_type       TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  storage_path   TEXT NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_patient ON documents(patient_id);

-- ============================================================= NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);

-- ============================================================= AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name   TEXT NOT NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
