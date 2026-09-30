-- Lets a doctor cap how many patients they'll take in a single day.
-- NULL means no cap (the doctor's availability windows are the only limit).
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_patient_limit INTEGER CHECK (daily_patient_limit IS NULL OR daily_patient_limit > 0);
