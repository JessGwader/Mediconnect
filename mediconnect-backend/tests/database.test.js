const db = require("../src/db");
const { truncateAll, closeDb } = require("./helpers/db");

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeDb(); });

const EXPECTED_TABLES = [
  "users", "patients", "refresh_tokens", "specialties", "clinics",
  "doctor_availability", "doctor_applications", "transfers", "conversations",
  "messages", "payments", "support_topics", "support_aliases", "support_messages",
  "consultations", "prescriptions", "documents", "appointments", "notifications", "audit_log",
];

describe("Database schema", () => {
  it("has every expected table", async () => {
    const { rows } = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const existing = rows.map((r) => r.table_name);
    for (const table of EXPECTED_TABLES) {
      expect(existing).toContain(table);
    }
  });

  it("rejects a duplicate user email at the database level (unique constraint), not just in application code", async () => {
    await db.query(
      `INSERT INTO users (name, email, password_hash, role, status, gender)
       VALUES ('A', 'dup@example.test', 'x', 'Patient', 'Active', 'Male')`
    );
    await expect(
      db.query(
        `INSERT INTO users (name, email, password_hash, role, status, gender)
         VALUES ('B', 'dup@example.test', 'x', 'Patient', 'Active', 'Male')`
      )
    ).rejects.toThrow();
  });

  it("rejects an invalid role value at the database level", async () => {
    await expect(
      db.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES ('X', 'badrole@example.test', 'x', 'SuperAdmin', 'Active')`
      )
    ).rejects.toThrow();
  });

  it("enforces the partial unique index that blocks double-booking at the database layer", async () => {
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Doc', 'doc-dbtest@example.test', 'x', 'Doctor', 'Active') RETURNING id`
    );
    const patientRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status, gender)
       VALUES ('Pat1', 'pat1-dbtest@example.test', 'x', 'Patient', 'Active', 'Male') RETURNING id`
    );
    const patient2Res = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status, gender)
       VALUES ('Pat2', 'pat2-dbtest@example.test', 'x', 'Patient', 'Active', 'Male') RETURNING id`
    );
    const p1 = await db.query(`INSERT INTO patients (user_id, mrn, name) VALUES ($1, 'MRN-DB1', 'Pat1') RETURNING id`, [patientRes.rows[0].id]);
    const p2 = await db.query(`INSERT INTO patients (user_id, mrn, name) VALUES ($1, 'MRN-DB2', 'Pat2') RETURNING id`, [patient2Res.rows[0].id]);

    await db.query(
      `INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, status)
       VALUES ($1, $2, '2027-01-04', '09:00', 'Pending')`,
      [p1.rows[0].id, userRes.rows[0].id]
    );

    await expect(
      db.query(
        `INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, status)
         VALUES ($1, $2, '2027-01-04', '09:00', 'Pending')`,
        [p2.rows[0].id, userRes.rows[0].id]
      )
    ).rejects.toThrow();
  });

  it("allows the same doctor/date/time again once the first appointment is Cancelled (partial index only covers active statuses)", async () => {
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Doc2', 'doc2-dbtest@example.test', 'x', 'Doctor', 'Active') RETURNING id`
    );
    const patientRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status, gender)
       VALUES ('Pat3', 'pat3-dbtest@example.test', 'x', 'Patient', 'Active', 'Male') RETURNING id`
    );
    const p1 = await db.query(`INSERT INTO patients (user_id, mrn, name) VALUES ($1, 'MRN-DB3', 'Pat3') RETURNING id`, [patientRes.rows[0].id]);

    await db.query(
      `INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, status)
       VALUES ($1, $2, '2027-01-05', '09:00', 'Cancelled')`,
      [p1.rows[0].id, userRes.rows[0].id]
    );

    await expect(
      db.query(
        `INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, status)
         VALUES ($1, $2, '2027-01-05', '09:00', 'Pending')`,
        [p1.rows[0].id, userRes.rows[0].id]
      )
    ).resolves.toBeDefined();
  });

  it("cascades deleting a user's refresh tokens when the user is deleted", async () => {
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Cascade', 'cascade@example.test', 'x', 'Patient', 'Active') RETURNING id`
    );
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, 'hash', now() + interval '1 day')`,
      [userRes.rows[0].id]
    );
    await db.query("DELETE FROM users WHERE id = $1", [userRes.rows[0].id]);
    const { rows } = await db.query("SELECT * FROM refresh_tokens WHERE user_id = $1", [userRes.rows[0].id]);
    expect(rows.length).toBe(0);
  });
});
