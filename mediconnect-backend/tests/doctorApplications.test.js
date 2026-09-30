const request = require("supertest");
const app = require("../src/app");
const db = require("../src/db");
const { truncateAll, closeDb } = require("./helpers/db");
const { registerPatient, makeAdmin, ensureSpecialty } = require("./helpers/factories");

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeDb(); });

describe("Doctor verification application workflow", () => {
  it("lets a Patient submit a Generalist application without picking a specialty", async () => {
    const patient = await registerPatient(app);
    const res = await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Generalist", licenseNumber: "LIC-001" })
      .expect(201);
    expect(res.body.application.status).toBe("Pending");
    expect(res.body.application.doctor_type).toBe("Generalist");
    expect(res.body.application.specialty_id).toBeTruthy(); // auto-tagged to General Medicine
  });

  it("requires a specialty for a Specialist application", async () => {
    const patient = await registerPatient(app);
    await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Specialist", licenseNumber: "LIC-002" })
      .expect(400);
  });

  it("accepts a Specialist application with a specialty", async () => {
    const patient = await registerPatient(app);
    const specialtyId = await ensureSpecialty("Cardiology");
    const res = await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Specialist", licenseNumber: "LIC-003", specialtyId })
      .expect(201);
    expect(res.body.application.specialty_id).toBe(specialtyId);
  });

  it("blocks a second pending application from the same patient", async () => {
    const patient = await registerPatient(app);
    await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Generalist", licenseNumber: "LIC-004" })
      .expect(201);
    await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Generalist", licenseNumber: "LIC-004-B" })
      .expect(409);
  });

  it("the applicant's account stays Patient-only while pending — cannot reach doctor routes", async () => {
    const patient = await registerPatient(app);
    await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Generalist", licenseNumber: "LIC-005" })
      .expect(201);

    await request(app)
      .get("/api/doctors/me/profile")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .expect(403);
  });

  it("approval is the only path that promotes a Patient to Doctor, and requires an Administrator", async () => {
    const patient = await registerPatient(app);
    const applied = await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Generalist", licenseNumber: "LIC-006" })
      .expect(201);

    // A patient cannot approve their own application.
    await request(app)
      .patch(`/api/doctor-applications/${applied.body.application.id}`)
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ status: "Approved" })
      .expect(403);

    const admin = await makeAdmin(app);
    const approved = await request(app)
      .patch(`/api/doctor-applications/${applied.body.application.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "Approved" })
      .expect(200);
    expect(approved.body.application.status).toBe("Approved");

    const { rows } = await db.query("SELECT role FROM users WHERE id = $1", [patient.user.id]);
    expect(rows[0].role).toBe("Doctor");
  });

  it("rejection leaves the applicant's role unchanged", async () => {
    const patient = await registerPatient(app);
    const applied = await request(app)
      .post("/api/doctor-applications")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorType: "Generalist", licenseNumber: "LIC-007" })
      .expect(201);

    const admin = await makeAdmin(app);
    await request(app)
      .patch(`/api/doctor-applications/${applied.body.application.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "Rejected" })
      .expect(200);

    const { rows } = await db.query("SELECT role FROM users WHERE id = $1", [patient.user.id]);
    expect(rows[0].role).toBe("Patient");
  });
});
