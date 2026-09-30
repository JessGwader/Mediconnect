const request = require("supertest");
const app = require("../src/app");
const db = require("../src/db");
const { truncateAll, closeDb } = require("./helpers/db");
const { registerPatient, makeDoctor, addAvailability } = require("./helpers/factories");

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeDb(); });

// A fixed future Monday so day-of-week arithmetic in the tests is stable
// regardless of when the suite actually runs.
function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

describe("Doctor availability and slot generation", () => {
  it("returns no slots for a doctor with no availability configured", async () => {
    const doctor = await makeDoctor(app);
    const res = await request(app).get(`/api/doctors/${doctor.user.id}/slots?date=${nextMonday()}`).set("Authorization", `Bearer ${doctor.accessToken}`).expect(200);
    expect(res.body.slots).toEqual([]);
  });

  it("generates real slots from a configured availability window", async () => {
    const doctor = await makeDoctor(app);
    const date = nextMonday();
    const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();
    await addAvailability(doctor.user.id, { dayOfWeek, startTime: "09:00", endTime: "10:00", slotMinutes: 30 });

    const res = await request(app).get(`/api/doctors/${doctor.user.id}/slots?date=${date}`).set("Authorization", `Bearer ${doctor.accessToken}`).expect(200);
    expect(res.body.slots).toEqual(["09:00", "09:30"]);
  });
});

describe("POST /api/appointments — booking rules", () => {
  async function setUpDoctorWithSlot() {
    const doctor = await makeDoctor(app);
    const date = nextMonday();
    const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();
    await addAvailability(doctor.user.id, { dayOfWeek, startTime: "09:00", endTime: "10:00", slotMinutes: 30 });
    return { doctor, date };
  }

  it("lets a patient book a real open slot", async () => {
    const { doctor, date } = await setUpDoctorWithSlot();
    const patient = await registerPatient(app);
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(201);
    expect(res.body.appointment.status).toBe("Pending");
  });

  it("refuses a booking outside the doctor's declared availability", async () => {
    const { doctor, date } = await setUpDoctorWithSlot();
    const patient = await registerPatient(app);
    await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "14:00" }) // outside 09:00-10:00
      .expect(409);
  });

  it("prevents double-booking the exact same doctor/date/time", async () => {
    const { doctor, date } = await setUpDoctorWithSlot();
    const patientA = await registerPatient(app);
    const patientB = await registerPatient(app);

    await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${patientA.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(201);

    await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${patientB.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(409);
  });

  it("blocks booking once the doctor's daily patient limit is reached", async () => {
    const doctor = await makeDoctor(app, { dailyLimit: 1 });
    const date = nextMonday();
    const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();
    await addAvailability(doctor.user.id, { dayOfWeek, startTime: "09:00", endTime: "11:00", slotMinutes: 30 });

    const patientA = await registerPatient(app);
    const patientB = await registerPatient(app);

    await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${patientA.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(201);

    // Different time slot, same day — should still be blocked by the daily cap.
    await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${patientB.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:30" })
      .expect(409);
  });

  it("reflects the daily cap as 'Full' in the doctor's real-time search status", async () => {
    const doctor = await makeDoctor(app, { dailyLimit: 1 });
    const today = new Date().toISOString().slice(0, 10);
    const todayDow = new Date().getUTCDay();
    await addAvailability(doctor.user.id, { dayOfWeek: todayDow, startTime: "00:00", endTime: "23:30", slotMinutes: 30 });

    const patient = await registerPatient(app);
    await db.query(
      `INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, status)
       VALUES ((SELECT id FROM patients WHERE user_id = $1), $2, $3, '00:00', 'Confirmed')`,
      [patient.user.id, doctor.user.id, today]
    );

    const res = await request(app).get("/api/doctors").set("Authorization", `Bearer ${patient.accessToken}`).expect(200);
    const entry = res.body.doctors.find((d) => d.id === doctor.user.id);
    expect(entry.status).toBe("Full");
  });

  it("blocks a patient under 18 from booking, while still allowing their account to exist", async () => {
    const { doctor, date } = await setUpDoctorWithSlot();
    const minor = await registerPatient(app, { dob: new Date(new Date().getFullYear() - 10, 0, 1).toISOString().slice(0, 10) });

    // Account works fine for non-booking actions:
    await request(app).get("/api/patients/me").set("Authorization", `Bearer ${minor.accessToken}`).expect(200);

    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${minor.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(403);
    expect(res.body.error).toMatch(/18/);
  });

  it("allows a patient just over 18 to book", async () => {
    const { doctor, date } = await setUpDoctorWithSlot();
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 19);
    const adult = await registerPatient(app, { dob: dob.toISOString().slice(0, 10) });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${adult.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(201);
  });
});

describe("PATCH /api/appointments/:id/cancel — patient self-cancellation", () => {
  it("allows cancelling a booking made well in advance", async () => {
    const doctor = await makeDoctor(app);
    const date = nextMonday();
    const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();
    await addAvailability(doctor.user.id, { dayOfWeek, startTime: "09:00", endTime: "10:00" });
    const patient = await registerPatient(app);

    const booked = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(201);

    const res = await request(app)
      .patch(`/api/appointments/${booked.body.appointment.id}/cancel`)
      .set("Authorization", `Bearer ${patient.accessToken}`)
      .expect(200);
    expect(res.body.appointment.status).toBe("Cancelled");
  });

  it("refuses to cancel an appointment that isn't the caller's own", async () => {
    const doctor = await makeDoctor(app);
    const date = nextMonday();
    const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();
    await addAvailability(doctor.user.id, { dayOfWeek, startTime: "09:00", endTime: "10:00" });
    const owner = await registerPatient(app);
    const stranger = await registerPatient(app);

    const booked = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ doctorId: doctor.user.id, date, time: "09:00" })
      .expect(201);

    await request(app)
      .patch(`/api/appointments/${booked.body.appointment.id}/cancel`)
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .expect(404); // scoped query finds nothing for a non-owner, same as "not found"
  });
});
