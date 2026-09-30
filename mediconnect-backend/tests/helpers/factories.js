const request = require("supertest");
const db = require("../../src/db");

let counter = 0;
function uniqueEmail(prefix) {
  counter += 1;
  return `${prefix}${Date.now()}${counter}@example.test`;
}

const VALID_PASSWORD = "Password1"; // meets the real 6-char minimum with room to spare

/**
 * Registers and logs in a real Patient through the actual API — exercises
 * the genuine registration contract (always Patient, requires dob+gender)
 * rather than inserting rows directly.
 */
async function registerPatient(app, overrides = {}) {
  const email = overrides.email || uniqueEmail("patient");
  const payload = {
    name: overrides.name || "Test Patient",
    email,
    password: overrides.password || VALID_PASSWORD,
    dob: overrides.dob || "1990-01-01",
    gender: overrides.gender || "Female",
  };
  await request(app).post("/api/auth/register").send(payload).expect(201);
  const loginRes = await request(app).post("/api/auth/login").send({ email, password: payload.password }).expect(200);
  return {
    accessToken: loginRes.body.accessToken,
    user: loginRes.body.user,
    cookie: loginRes.headers["set-cookie"],
  };
}

/**
 * Fast path for tests that need "a doctor" to exist but aren't testing the
 * application/approval workflow itself — registers a real patient, then
 * promotes them directly via the database (equivalent to what an admin's
 * approval does, minus going through the actual application submission).
 */
async function makeDoctor(app, overrides = {}) {
  const password = overrides.password || VALID_PASSWORD;
  const session = await registerPatient(app, { ...overrides, password });
  const specialtyId = overrides.specialtyId || (await ensureSpecialty("General Medicine"));
  await db.query(
    "UPDATE users SET role = $1, specialty_id = $2, daily_patient_limit = $3 WHERE id = $4",
    [overrides.role || "Doctor", specialtyId, overrides.dailyLimit ?? null, session.user.id]
  );
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: session.user.email, password })
    .expect(200);
  return { accessToken: loginRes.body.accessToken, user: loginRes.body.user, cookie: loginRes.headers["set-cookie"] };
}

/**
 * Admins can only be created by other admins (correctly, there is no
 * self-service path) — so tests create the first one directly via the database.
 */
async function makeAdmin(app, overrides = {}) {
  const password = overrides.password || VALID_PASSWORD;
  const session = await registerPatient(app, { ...overrides, password });
  await db.query("UPDATE users SET role = 'Administrator' WHERE id = $1", [session.user.id]);
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: session.user.email, password })
    .expect(200);
  return { accessToken: loginRes.body.accessToken, user: loginRes.body.user, cookie: loginRes.headers["set-cookie"] };
}

async function ensureSpecialty(name) {
  const existing = await db.query("SELECT id FROM specialties WHERE name = $1", [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await db.query("INSERT INTO specialties (name) VALUES ($1) RETURNING id", [name]);
  return inserted.rows[0].id;
}

async function addAvailability(doctorId, { dayOfWeek, startTime = "09:00", endTime = "17:00", slotMinutes = 30 }) {
  await db.query(
    "INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES ($1,$2,$3,$4,$5)",
    [doctorId, dayOfWeek, startTime, endTime, slotMinutes]
  );
}

module.exports = { registerPatient, makeDoctor, makeAdmin, ensureSpecialty, addAvailability, uniqueEmail, VALID_PASSWORD };
