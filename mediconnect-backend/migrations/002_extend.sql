-- MediConnect schema extension: specialties, clinics, availability, formal
-- transfers, messaging, payments, email verification, password reset.
-- Run after 001_init.sql (the migrate script applies files in order).

-- ============================================================= SPECIALTIES
CREATE TABLE IF NOT EXISTS specialties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================= CLINICS
CREATE TABLE IF NOT EXISTS clinics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  city        TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinics_coords ON clinics(latitude, longitude);

-- Doctors: link to a specialty row and a home clinic (both optional —
-- the existing free-text users.specialty column is kept for backward
-- compatibility and gradually superseded by specialty_id).
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty_id UUID REFERENCES specialties(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
CREATE INDEX IF NOT EXISTS idx_users_specialty ON users(specialty_id);
CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id);

-- ============================================================= DOCTOR AVAILABILITY
-- Recurring weekly availability windows. Concrete bookings are still checked
-- against existing `appointments` rows to prevent double-booking.
CREATE TABLE IF NOT EXISTS doctor_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  slot_minutes SMALLINT NOT NULL DEFAULT 30,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_avail_doctor ON doctor_availability(doctor_id);

-- Prevent two confirmed/pending appointments for the same doctor at the same
-- exact date+time (belt-and-braces alongside the application-level check).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_doctor_slot
  ON appointments(doctor_id, scheduled_date, scheduled_time)
  WHERE status IN ('Pending','Confirmed','Rescheduled');

-- ============================================================= FORMAL TRANSFERS
-- Supersedes the earlier ad-hoc "transfer" (which only wrote an audit log
-- entry). This is a real approval workflow with its own status lifecycle.
CREATE TABLE IF NOT EXISTS transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_doctor_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  to_doctor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  to_clinic_id    UUID REFERENCES clinics(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Requested'
                    CHECK (status IN ('Requested','Accepted','Rejected','Completed','Cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_doctor_id IS NOT NULL OR to_clinic_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_transfers_patient ON transfers(patient_id);

-- ============================================================= MESSAGING
-- One conversation per (patient, doctor) pair — created lazily the first
-- time either party messages, and only once an authorization relationship
-- exists (an appointment or an active consultation between them).
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT,
  attachment_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR attachment_document_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ============================================================= PAYMENTS
-- Never stores card/mobile-money credentials — only the provider's
-- transaction reference and the status we've verified server-side against
-- the provider's API (never trust a frontend "success" callback alone).
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  appointment_id    UUID REFERENCES appointments(id) ON DELETE SET NULL,
  amount            NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'XAF',
  provider          TEXT NOT NULL DEFAULT 'CinetPay',
  transaction_ref   TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'Pending'
                       CHECK (status IN ('Pending','Successful','Failed','Cancelled','Refunded')),
  provider_metadata JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);

-- ============================================================= EMAIL VERIFICATION / PASSWORD RESET
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed a starter specialty list — administrators can add more via the API.
INSERT INTO specialties (name) VALUES
  ('Cardiology'), ('Endocrinology'), ('General Medicine'), ('Pediatrics'),
  ('Dermatology'), ('Neurology'), ('Gynecology'), ('Orthopedics')
ON CONFLICT (name) DO NOTHING;
