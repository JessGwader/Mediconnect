const db = require("../../src/db");

// Every app table, in one TRUNCATE ... CASCADE — order doesn't matter with
// CASCADE, and RESTART IDENTITY keeps serial-like sequences (none here, but
// harmless) predictable across runs.
const TABLES = [
  "users", "patients", "refresh_tokens", "email_verification_tokens", "password_reset_tokens",
  "specialties", "clinics", "doctor_availability", "doctor_applications",
  "transfers", "conversations", "messages", "payments",
  "support_topics", "support_aliases", "support_messages",
  "consultations", "prescriptions", "documents", "appointments",
  "notifications", "audit_log",
];

async function truncateAll() {
  await db.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

async function closeDb() {
  await db.pool.end();
}

module.exports = { truncateAll, closeDb };
