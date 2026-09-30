-- A "Suspended" status now carries a real end time, so it's meaningfully
-- different from "Disabled" (permanent, admin must manually reactivate).
-- NULL means no scheduled expiry (shouldn't normally happen for Suspended,
-- but the column stays nullable since it's meaningless for other statuses).
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
