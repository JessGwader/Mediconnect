-- Doctor applications: lets someone register once and pick "I'm a Doctor"
-- without the registration endpoint itself ever being able to grant Doctor
-- access. The account is created as Patient (unchanged, secure default);
-- this table just queues a request an administrator reviews before the
-- role is promoted via the existing /api/admin/users/:id/role endpoint.

CREATE TABLE IF NOT EXISTS doctor_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty_id    UUID REFERENCES specialties(id),
  clinic_id       UUID REFERENCES clinics(id),
  license_number  TEXT NOT NULL,
  bio             TEXT,
  status          TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Approved','Rejected')),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_apps_status ON doctor_applications(status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_doctor_app_pending ON doctor_applications(user_id) WHERE status = 'Pending';
