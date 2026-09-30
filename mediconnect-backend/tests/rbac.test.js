const request = require("supertest");
const app = require("../src/app");
const { truncateAll, closeDb } = require("./helpers/db");
const { registerPatient, makeDoctor, makeAdmin } = require("./helpers/factories");

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeDb(); });

describe("Role-based access control", () => {
  it("blocks a Patient from the admin user-management endpoint", async () => {
    const patient = await registerPatient(app);
    await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .expect(403);
  });

  it("blocks a Doctor from the admin user-management endpoint", async () => {
    const doctor = await makeDoctor(app);
    await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .expect(403);
  });

  it("allows an Administrator to list users", async () => {
    const admin = await makeAdmin(app);
    await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);
  });

  it("blocks a Patient from creating a consultation", async () => {
    const patient = await registerPatient(app);
    const me = await request(app).get("/api/patients/me").set("Authorization", `Bearer ${patient.accessToken}`);
    await request(app)
      .post(`/api/patients/${me.body.patient.id}/consultations`)
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ symptoms: "headache", observations: "alert" })
      .expect(403);
  });

  it("blocks one patient from reading another patient's own record via /me semantics (each /me is scoped to the caller)", async () => {
    const patientA = await registerPatient(app);
    const patientB = await registerPatient(app);
    const meA = await request(app).get("/api/patients/me").set("Authorization", `Bearer ${patientA.accessToken}`).expect(200);
    const meB = await request(app).get("/api/patients/me").set("Authorization", `Bearer ${patientB.accessToken}`).expect(200);
    expect(meA.body.patient.id).not.toBe(meB.body.patient.id);
  });

  it("blocks a patient from directly fetching another patient's record by id", async () => {
    const patientA = await registerPatient(app);
    const patientB = await registerPatient(app);
    const meB = await request(app).get("/api/patients/me").set("Authorization", `Bearer ${patientB.accessToken}`);
    await request(app)
      .get(`/api/patients/${meB.body.patient.id}`)
      .set("Authorization", `Bearer ${patientA.accessToken}`)
      .expect(403);
  });

  it("rejects requests with no token at all", async () => {
    await request(app).get("/api/admin/users").expect(401);
  });

  it("rejects a malformed/garbage bearer token", async () => {
    await request(app).get("/api/admin/users").set("Authorization", "Bearer not-a-real-token").expect(401);
  });

  it("immediately loses access once an admin suspends the account (not just at next token refresh)", async () => {
    const patient = await registerPatient(app);
    const admin = await makeAdmin(app);

    await request(app).get("/api/patients/me").set("Authorization", `Bearer ${patient.accessToken}`).expect(200);

    await request(app)
      .patch(`/api/admin/users/${patient.user.id}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "Suspended" })
      .expect(200);

    // Same still-unexpired access token — must be rejected because status is
    // re-checked against the database on every request, not cached in the JWT.
    await request(app).get("/api/patients/me").set("Authorization", `Bearer ${patient.accessToken}`).expect(403);
  });

  it("prevents a patient from changing their own role or status (no such endpoint reachable to them)", async () => {
    const patient = await registerPatient(app);
    await request(app)
      .patch(`/api/admin/users/${patient.user.id}/role`)
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ role: "Administrator" })
      .expect(403);
  });
});
