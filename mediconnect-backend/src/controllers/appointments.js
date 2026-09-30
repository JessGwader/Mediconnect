const db = require("../db");
const { logAction, notify } = require("../middleware/audit");
const { sendMail, templates } = require("../services/emailService");
const { ApiError } = require("../middleware/errorHandler");

const VALID_STATUSES = ["Pending", "Confirmed", "Rejected", "Rescheduled", "Completed", "Cancelled"];

// Shared by POST / (new booking), PATCH /:id (doctor reschedule), and
// PATCH /:id/reschedule (patient reschedule) so the three write paths can
// never drift out of sync on what actually makes a slot valid. Throws an
// ApiError if the slot fails any check.
async function assertBookableSlot({ doctorId, date, time, excludeAppointmentId }) {
  const scheduledAt = new Date(`${date}T${time}`);
  if (isNaN(scheduledAt.getTime())) throw new ApiError(400, "Invalid date or time.");
  if (scheduledAt.getTime() <= Date.now()) {
    throw new ApiError(400, "Appointments must be scheduled in the future.");
  }

  const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();
  const availRes = await db.query(
    "SELECT 1 FROM doctor_availability WHERE doctor_id = $1 AND day_of_week = $2 AND $3::time >= start_time AND $3::time < end_time",
    [doctorId, dayOfWeek, time]
  );
  if (availRes.rows.length === 0) {
    throw new ApiError(409, "This doctor is not available at the requested time.");
  }

  const doctorRes = await db.query("SELECT daily_patient_limit FROM users WHERE id = $1", [doctorId]);
  const dailyLimit = doctorRes.rows[0]?.daily_patient_limit;
  if (dailyLimit != null) {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM appointments
       WHERE doctor_id = $1 AND scheduled_date = $2 AND status IN ('Pending','Confirmed','Rescheduled')
         AND ($3::uuid IS NULL OR id != $3::uuid)`,
      [doctorId, date, excludeAppointmentId || null]
    );
    if (Number(countRes.rows[0].count) >= dailyLimit) {
      throw new ApiError(409, "This doctor has reached their patient limit for that day.");
    }
  }
}

// GET /api/appointments — scoped to the caller (doctor's own, or patient's own)
async function list(req, res, next) {
  try {
    let rows;
    if (req.user.role === "Patient") {
      ({ rows } = await db.query(
        `SELECT a.*, u.name AS doctor_name FROM appointments a
         JOIN users u ON u.id = a.doctor_id
         JOIN patients p ON p.id = a.patient_id
         WHERE p.user_id = $1 ORDER BY a.scheduled_date, a.scheduled_time`,
        [req.user.id]
      ));
    } else if (["Doctor", "Specialist"].includes(req.user.role)) {
      ({ rows } = await db.query(
        `SELECT a.*, p.name AS patient_name FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.doctor_id = $1 ORDER BY a.scheduled_date, a.scheduled_time`,
        [req.user.id]
      ));
    } else {
      ({ rows } = await db.query(
        `SELECT a.*, p.name AS patient_name, u.name AS doctor_name FROM appointments a
         JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = a.doctor_id
         ORDER BY a.scheduled_date, a.scheduled_time`
      ));
    }
    res.json({ appointments: rows });
  } catch (err) { next(err); }
}

// POST /api/appointments  { doctorId, date, time } — patients request an appointment
async function create(req, res, next) {
  try {
    const { doctorId, date, time } = req.body;
    if (!doctorId || !date || !time) throw new ApiError(400, "doctorId, date, and time are required.");
    const patientRes = await db.query("SELECT id, dob FROM patients WHERE user_id = $1", [req.user.id]);
    if (!patientRes.rows[0]) throw new ApiError(404, "Patient record not found.");

    if (patientRes.rows[0].dob) {
      const dob = new Date(patientRes.rows[0].dob);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const hasHadBirthdayThisYear = (today.getMonth() > dob.getMonth()) ||
        (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
      if (!hasHadBirthdayThisYear) age -= 1;
      if (age < 18) throw new ApiError(403, "You must be 18 or older to book an appointment. A parent or guardian should contact the clinic directly.");
    }

    // Confirm the requested slot actually falls inside the doctor's declared
    // availability, is in the future, and hasn't hit the doctor's daily cap —
    // defense in depth, since the frontend should only ever offer slots from
    // GET /api/doctors/:id/slots in the first place.
    await assertBookableSlot({ doctorId, date, time });

    // A patient can't be in two places at once, even with two different doctors.
    const patientConflict = await db.query(
      `SELECT 1 FROM appointments WHERE patient_id = $1 AND scheduled_date = $2 AND scheduled_time = $3
         AND status IN ('Pending','Confirmed','Rescheduled')`,
      [patientRes.rows[0].id, date, time]
    );
    if (patientConflict.rows[0]) throw new ApiError(409, "You already have an appointment at that time.");

    let appointment;
    try {
      const { rows } = await db.query(
        `INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, status)
         VALUES ($1, $2, $3, $4, 'Pending') RETURNING *`,
        [patientRes.rows[0].id, doctorId, date, time]
      );
      appointment = rows[0];
    } catch (err) {
      // The partial unique index (uniq_doctor_slot) is the final, atomic
      // guarantee against double-booking even under concurrent requests.
      if (err.code === "23505") throw new ApiError(409, "This slot was just booked by someone else. Please pick another.");
      throw err;
    }

    await logAction(req.user, "Requested a new appointment", "appointment", appointment.id);
    await notify(doctorId, `${req.user.name} requested an appointment on ${date} at ${time}.`);
    res.status(201).json({ appointment });
  } catch (err) { next(err); }
}

// PATCH /api/appointments/:id  { status } — doctors accept/reject/reschedule/complete/cancel
async function updateStatus(req, res, next) {
  try {
    const { status, date, time } = req.body;
    if (!VALID_STATUSES.includes(status)) throw new ApiError(400, "Invalid status.");

    const existingRes = await db.query(
      "SELECT * FROM appointments WHERE id = $1 AND doctor_id = $2",
      [req.params.id, req.user.id]
    );
    const existing = existingRes.rows[0];
    if (!existing) throw new ApiError(404, "Appointment not found.");

    // A doctor changing the date/time must land back inside their own
    // declared availability, same as a brand-new booking — this used to be
    // skipped entirely for doctor-side changes, letting a reschedule bypass
    // the doctor's own schedule and daily cap.
    if (date || time) {
      const finalDate = date || String(existing.scheduled_date).slice(0, 10);
      const finalTime = time || String(existing.scheduled_time).slice(0, 5);
      await assertBookableSlot({ doctorId: req.user.id, date: finalDate, time: finalTime, excludeAppointmentId: existing.id });
    }

    const fields = ["status = $1"];
    const values = [status];
    if (date) { values.push(date); fields.push(`scheduled_date = $${values.length}`); }
    if (time) { values.push(time); fields.push(`scheduled_time = $${values.length}`); }
    values.push(req.params.id, req.user.id);

    let rows;
    try {
      ({ rows } = await db.query(
        `UPDATE appointments SET ${fields.join(", ")}, updated_at = now()
         WHERE id = $${values.length - 1} AND doctor_id = $${values.length} RETURNING *`,
        values
      ));
    } catch (err) {
      if (err.code === "23505") throw new ApiError(409, "That new date/time is already booked.");
      throw err;
    }
    if (!rows[0]) throw new ApiError(404, "Appointment not found.");
    const appt = rows[0];

    await logAction(req.user, `Set appointment status to ${status}`, "appointment", appt.id);

    if (["Confirmed", "Cancelled", "Rejected"].includes(status)) {
      const patientRes = await db.query(
        "SELECT p.name, u.id AS user_id, u.email FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1",
        [appt.patient_id]
      );
      const patient = patientRes.rows[0];
      if (patient) {
        await notify(patient.user_id, `Your appointment on ${appt.scheduled_date} is now ${status}.`);
        const dateStr = String(appt.scheduled_date).slice(0, 10);
        const timeStr = String(appt.scheduled_time).slice(0, 5);
        if (status === "Confirmed") {
          await sendMail(patient.email, "Appointment confirmed", templates.appointmentConfirmed(patient.name, req.user.name, dateStr, timeStr));
        } else {
          await sendMail(patient.email, "Appointment cancelled", templates.appointmentCancelled(patient.name, req.user.name, dateStr, timeStr));
        }
      }
    }

    res.json({ appointment: appt });
  } catch (err) { next(err); }
}

// PATCH /api/appointments/:id/reschedule  { date, time } — a patient moving
// their own appointment. Same 2-hour notice rule as cancellation, and the
// same slot validation as a brand-new booking. Resets status to Pending —
// like a fresh booking, the doctor still needs to confirm the new time.
async function reschedule(req, res, next) {
  try {
    const { date, time } = req.body;
    if (!date || !time) throw new ApiError(400, "date and time are required.");

    const apptRes = await db.query(
      `SELECT a.* FROM appointments a JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );
    const appt = apptRes.rows[0];
    if (!appt) throw new ApiError(404, "Appointment not found.");
    if (!["Pending", "Confirmed"].includes(appt.status)) {
      throw new ApiError(400, `An appointment that is ${appt.status} cannot be rescheduled.`);
    }
    const currentScheduledAt = new Date(`${appt.scheduled_date}T${appt.scheduled_time}`);
    const hoursUntil = (currentScheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 2) {
      throw new ApiError(400, "Appointments can only be rescheduled more than 2 hours in advance.");
    }

    await assertBookableSlot({ doctorId: appt.doctor_id, date, time, excludeAppointmentId: appt.id });

    let rows;
    try {
      ({ rows } = await db.query(
        `UPDATE appointments SET scheduled_date = $1, scheduled_time = $2, status = 'Pending', updated_at = now()
         WHERE id = $3 RETURNING *`,
        [date, time, appt.id]
      ));
    } catch (err) {
      if (err.code === "23505") throw new ApiError(409, "That slot was just booked by someone else. Please pick another.");
      throw err;
    }

    await logAction(req.user, "Rescheduled their appointment", "appointment", appt.id);
    await notify(appt.doctor_id, `${req.user.name} requested to reschedule to ${date} at ${time}.`);
    res.json({ appointment: rows[0] });
  } catch (err) { next(err); }
}

// PATCH /api/appointments/:id/cancel — a patient cancelling their own appointment.
// Cancellation rule: must be more than 2 hours before the scheduled time, and
// only from Pending/Confirmed (not already Completed/Cancelled/Rejected).
async function cancel(req, res, next) {
  try {
    const apptRes = await db.query(
      `SELECT a.* FROM appointments a JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );
    const appt = apptRes.rows[0];
    if (!appt) throw new ApiError(404, "Appointment not found.");
    if (!["Pending", "Confirmed"].includes(appt.status)) {
      throw new ApiError(400, `An appointment that is ${appt.status} cannot be cancelled.`);
    }
    const scheduledAt = new Date(`${appt.scheduled_date}T${appt.scheduled_time}`);
    const hoursUntil = (scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 2) {
      throw new ApiError(400, "Appointments can only be cancelled more than 2 hours in advance.");
    }

    const { rows } = await db.query(
      "UPDATE appointments SET status = 'Cancelled', updated_at = now() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    await logAction(req.user, "Cancelled their appointment", "appointment", req.params.id);
    await notify(appt.doctor_id, `${req.user.name} cancelled their appointment on ${appt.scheduled_date}.`);
    res.json({ appointment: rows[0] });
  } catch (err) { next(err); }
}

module.exports = { assertBookableSlot, list, create, updateStatus, reschedule, cancel };
