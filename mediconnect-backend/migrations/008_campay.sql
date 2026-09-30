-- Switch payment provider from CinetPay to Campay (MTN MoMo + Orange Money).
-- Existing historical rows keep whatever provider they were actually
-- processed by — this only changes the default for new inserts, and the
-- application code always sets `provider` explicitly anyway.
ALTER TABLE payments ALTER COLUMN provider SET DEFAULT 'Campay';
