const request = require("supertest");
const app = require("../src/app");
const db = require("../src/db");
const { truncateAll, closeDb } = require("./helpers/db");
const { registerPatient, makeDoctor } = require("./helpers/factories");

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeDb(); });

async function makePatientRecord(app) {
  const patient = await registerPatient(app);
  const me = await request(app).get("/api/patients/me").set("Authorization", `Bearer ${patient.accessToken}`);
  return { patient, patientId: me.body.patient.id };
}

describe("POST /api/patients/:id/prescriptions — safety checks", () => {
  it("saves a prescription with no conflicts", async () => {
    const doctor = await makeDoctor(app);
    const { patientId } = await makePatientRecord(app);

    const res = await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Paracetamol 500mg" })
      .expect(201);
    expect(res.body.prescription.status).toBe("Active");
  });

  it("blocks a prescription that conflicts with a documented allergy, unless overridden", async () => {
    const doctor = await makeDoctor(app);
    const { patient, patientId } = await makePatientRecord(app);
    await db.query("UPDATE patients SET allergies = $1 WHERE user_id = $2", [["Penicillin"], patient.user.id]);

    const blocked = await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Amoxicillin 500mg" })
      .expect(409);
    expect(blocked.body.requiresOverride).toBe(true);
    expect(blocked.body.warnings.some((w) => w.level === "critical")).toBe(true);

    const overridden = await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Amoxicillin 500mg", override: true })
      .expect(201);
    expect(overridden.body.prescription.medication).toMatch(/override/i);
  });

  it("flags a known drug-drug interaction", async () => {
    const doctor = await makeDoctor(app);
    const { patientId } = await makePatientRecord(app);

    await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Warfarin 5mg" })
      .expect(201);

    const res = await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Aspirin 100mg" })
      .expect(409);
    expect(res.body.warnings.some((w) => /bleeding/i.test(w.text))).toBe(true);
  });

  it("flags a duplicate active prescription as a (non-blocking) warning", async () => {
    const doctor = await makeDoctor(app);
    const { patientId } = await makePatientRecord(app);

    await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Paracetamol 500mg" })
      .expect(201);

    // No allergy/interaction conflict here, so a duplicate alone doesn't block the save.
    const res = await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Paracetamol 500mg" })
      .expect(201);
    expect(res.body.warnings.some((w) => /duplicate/i.test(w.text))).toBe(true);
  });

  it("rejects a prescription request from a Patient account", async () => {
    const { patientId, patient } = await makePatientRecord(app);
    await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ medication: "Paracetamol 500mg" })
      .expect(403);
  });

  it("lets a doctor discontinue an active prescription", async () => {
    const doctor = await makeDoctor(app);
    const { patientId } = await makePatientRecord(app);
    const created = await request(app)
      .post(`/api/patients/${patientId}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ medication: "Paracetamol 500mg" });

    const res = await request(app)
      .patch(`/api/patients/${patientId}/prescriptions/${created.body.prescription.id}`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({ status: "Discontinued" })
      .expect(200);
    expect(res.body.prescription.status).toBe("Discontinued");
  });
});
