const db = require("../db");
const { logAction } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");

// Computes each doctor's real-time status:
//   Unavailable — the doctor has never configured any weekly availability
//   Full        — has a daily patient limit set and today's appointment
//                 count has already reached it
//   Available   — anything else
function computeStatus(doctor) {
  if (!doctor.has_availability) return "Unavailable";
  if (doctor.daily_patient_limit != null && doctor.today_count >= doctor.daily_patient_limit) return "Full";
  return "Available";
}

// GET /api/doctors/me/profile — a doctor viewing their own full profile
async function getMyProfile(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.gender, u.bio, u.specialty, u.daily_patient_limit, u.avatar_path,
              s.id AS specialty_id, s.name AS specialty_name, c.id AS clinic_id, c.name AS clinic_name
       FROM users u
       LEFT JOIN specialties s ON s.id = u.specialty_id
       LEFT JOIN clinics c ON c.id = u.clinic_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows[0]) throw new ApiError(404, "Profile not found.");
    const ratingRes = await db.query(
      "SELECT ROUND(AVG(rating)::numeric,1) AS avg_rating, COUNT(*) AS rating_count FROM doctor_ratings WHERE doctor_id = $1",
      [req.user.id]
    );
    const extraRes = await db.query(
      `SELECT ds.id, ds.license_number, s.id AS specialty_id, s.name AS specialty_name
       FROM doctor_specialties ds JOIN specialties s ON s.id = ds.specialty_id
       WHERE ds.user_id = $1 ORDER BY ds.created_at`,
      [req.user.id]
    );
    res.json({
      profile: { ...rows[0], hasAvatar: !!rows[0].avatar_path },
      additionalSpecialties: extraRes.rows,
      avgRating: ratingRes.rows[0].avg_rating != null ? Number(ratingRes.rows[0].avg_rating) : null,
      ratingCount: Number(ratingRes.rows[0].rating_count),
    });
  } catch (err) { next(err); }
}

// A Specialist may hold their primary specialty (users.specialty_id) plus at
// most ONE additional one here — each with its own matriculation number,
// since a second specialty is still a separate professional qualification.
const MAX_ADDITIONAL_SPECIALTIES = 1;

// GET /api/doctors/me/specialties — my additional specialties
async function listMySpecialties(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT ds.id, ds.license_number, ds.created_at, s.id AS specialty_id, s.name AS specialty_name
       FROM doctor_specialties ds JOIN specialties s ON s.id = ds.specialty_id
       WHERE ds.user_id = $1 ORDER BY ds.created_at`,
      [req.user.id]
    );
    res.json({ specialties: rows });
  } catch (err) { next(err); }
}

// POST /api/doctors/me/specialties  { specialtyId, licenseNumber }
// Adds a second specialty. Only Specialists (Generalists have no specialty
// concept to add to), capped at MAX_ADDITIONAL_SPECIALTIES, and it can't
// duplicate the doctor's own primary specialty.
async function addMySpecialty(req, res, next) {
  try {
    const { specialtyId, licenseNumber } = req.body;
    if (!specialtyId || !licenseNumber || !licenseNumber.trim()) {
      throw new ApiError(400, "specialtyId and licenseNumber are both required.");
    }
    const meRes = await db.query("SELECT specialty_id FROM users WHERE id = $1", [req.user.id]);
    if (meRes.rows[0]?.specialty_id === specialtyId) {
      throw new ApiError(400, "That is already your primary specialty.");
    }
    const countRes = await db.query("SELECT COUNT(*) FROM doctor_specialties WHERE user_id = $1", [req.user.id]);
    if (Number(countRes.rows[0].count) >= MAX_ADDITIONAL_SPECIALTIES) {
      throw new ApiError(400, `You can add at most ${MAX_ADDITIONAL_SPECIALTIES} additional specialty.`);
    }
    const { rows } = await db.query(
      `INSERT INTO doctor_specialties (user_id, specialty_id, license_number) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, specialty_id) DO NOTHING RETURNING *`,
      [req.user.id, specialtyId, licenseNumber.trim()]
    );
    if (!rows[0]) throw new ApiError(409, "You already have that specialty on file.");
    await logAction(req.user, "Added an additional specialty", "user", req.user.id);
    res.status(201).json({ specialty: rows[0] });
  } catch (err) { next(err); }
}

async function removeMySpecialty(req, res, next) {
  try {
    const { rows } = await db.query(
      "DELETE FROM doctor_specialties WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new ApiError(404, "Additional specialty not found.");
    await logAction(req.user, "Removed an additional specialty", "user", req.user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// PATCH /api/doctors/me/profile  { name, bio, clinicId, phone }
// Deliberately narrow: a doctor cannot change their own specialty or
// verification status here — that stays admin/application-controlled.
async function updateMyProfile(req, res, next) {
  try {
    const { name, bio, clinicId, phone } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { values.push(name); fields.push(`name = $${values.length}`); }
    if (bio !== undefined) { values.push(bio); fields.push(`bio = $${values.length}`); }
    if (clinicId !== undefined) { values.push(clinicId || null); fields.push(`clinic_id = $${values.length}`); }
    if (phone !== undefined) { values.push(phone || null); fields.push(`phone = $${values.length}`); }
    if (fields.length === 0) throw new ApiError(400, "No fields to update.");
    values.push(req.user.id);
    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(", ")}, updated_at = now() WHERE id = $${values.length} RETURNING id, name, bio, clinic_id, phone`,
      values
    );
    await logAction(req.user, "Updated their own profile", "user", req.user.id);
    res.json({ profile: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/doctors?specialtyId=&clinicId=&search=&status=Available|Full|Unavailable
// Backed by the database, per spec section 17 (search must not be purely frontend filtering).
async function list(req, res, next) {
  try {
    const conditions = ["u.role IN ('Doctor','Specialist')", "u.status = 'Active'"];
    const params = [];
    if (req.query.specialtyId) { params.push(req.query.specialtyId); conditions.push(`u.specialty_id = $${params.length}`); }
    if (req.query.clinicId) { params.push(req.query.clinicId); conditions.push(`u.clinic_id = $${params.length}`); }
    if (req.query.search) { params.push(`%${req.query.search.toLowerCase()}%`); conditions.push(`LOWER(u.name) LIKE $${params.length}`); }

    const { rows } = await db.query(
      `SELECT u.id, u.name, u.specialty, u.daily_patient_limit, u.avatar_path, s.name AS specialty_name,
              c.name AS clinic_name, c.city AS clinic_city,
              EXISTS(SELECT 1 FROM doctor_availability da WHERE da.doctor_id = u.id) AS has_availability,
              (SELECT COUNT(*) FROM appointments a
                 WHERE a.doctor_id = u.id AND a.scheduled_date = CURRENT_DATE
                   AND a.status IN ('Pending','Confirmed','Rescheduled')) AS today_count,
              (SELECT ROUND(AVG(rating)::numeric, 1) FROM doctor_ratings dr WHERE dr.doctor_id = u.id) AS avg_rating,
              (SELECT COUNT(*) FROM doctor_ratings dr WHERE dr.doctor_id = u.id) AS rating_count
       FROM users u
       LEFT JOIN specialties s ON s.id = u.specialty_id
       LEFT JOIN clinics c ON c.id = u.clinic_id
       WHERE ${conditions.join(" AND ")} ORDER BY u.name`,
      params
    );

    let doctors = rows.map((r) => ({
      id: r.id, name: r.name, specialty: r.specialty, specialty_name: r.specialty_name,
      clinic_name: r.clinic_name, clinic_city: r.clinic_city,
      daily_patient_limit: r.daily_patient_limit,
      hasAvatar: !!r.avatar_path,
      avgRating: r.avg_rating != null ? Number(r.avg_rating) : null,
      ratingCount: Number(r.rating_count),
      status: computeStatus({ has_availability: r.has_availability, daily_patient_limit: r.daily_patient_limit, today_count: Number(r.today_count) }),
    }));

    if (req.query.status) {
      const wanted = req.query.status;
      doctors = doctors.filter((d) => d.status === wanted);
    }
    if (req.query.sort === "rating") {
      doctors.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0) || b.ratingCount - a.ratingCount);
    }

    res.json({ doctors });
  } catch (err) { next(err); }
}

// GET /api/doctors/me/capacity — read my own current daily patient limit
async function getMyCapacity(req, res, next) {
  try {
    const { rows } = await db.query("SELECT daily_patient_limit FROM users WHERE id = $1", [req.user.id]);
    res.json({ dailyPatientLimit: rows[0]?.daily_patient_limit ?? null });
  } catch (err) { next(err); }
}

// PATCH /api/doctors/me/capacity  { dailyLimit: number|null }
// A doctor sets the maximum number of patients they'll accept in one day.
async function setMyCapacity(req, res, next) {
  try {
    const { dailyLimit } = req.body;
    if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit <= 0)) {
      throw new ApiError(400, "dailyLimit must be a positive integer, or null to remove the cap.");
    }
    const { rows } = await db.query(
      "UPDATE users SET daily_patient_limit = $1, updated_at = now() WHERE id = $2 RETURNING id, daily_patient_limit",
      [dailyLimit, req.user.id]
    );
    await logAction(req.user, dailyLimit ? `Set daily patient limit to ${dailyLimit}` : "Removed daily patient limit");
    res.json({ dailyPatientLimit: rows[0].daily_patient_limit });
  } catch (err) { next(err); }
}

// GET /api/doctors/me/dashboard — the doctor's home-screen summary: today's
// schedule, a few at-a-glance counts, and their most recent patient activity.
async function getMyDashboard(req, res, next) {
  try {
    const [todayRes, countsRes, unreadRes, recentConsultRes] = await Promise.all([
      db.query(
        `SELECT a.id, a.scheduled_time, a.status, p.id AS patient_id, p.name AS patient_name
         FROM appointments a JOIN patients p ON p.id = a.patient_id
         WHERE a.doctor_id = $1 AND a.scheduled_date = CURRENT_DATE
         ORDER BY a.scheduled_time`,
        [req.user.id]
      ),
      db.query(
        `SELECT
           (SELECT COUNT(*) FROM appointments WHERE doctor_id = $1 AND scheduled_date = CURRENT_DATE) AS today_total,
           (SELECT COUNT(*) FROM appointments WHERE doctor_id = $1 AND scheduled_date = CURRENT_DATE AND status = 'Completed') AS today_completed,
           (SELECT COUNT(*) FROM appointments WHERE doctor_id = $1 AND status = 'Pending') AS pending_requests,
           (SELECT COUNT(DISTINCT p.id) FROM patients p
              WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.doctor_id = $1)
                 OR EXISTS (SELECT 1 FROM transfers tr WHERE tr.patient_id = p.id AND tr.to_doctor_id = $1)) AS total_patients`,
        [req.user.id]
      ),
      db.query(
        `SELECT COALESCE(SUM(unread), 0) AS unread_messages FROM (
           SELECT (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id != $1) AS unread
           FROM conversations c WHERE c.doctor_id = $1
         ) sub`,
        [req.user.id]
      ),
      db.query(
        `SELECT c.id, c.diagnosis, c.created_at, p.id AS patient_id, p.name AS patient_name
         FROM consultations c JOIN patients p ON p.id = c.patient_id
         WHERE c.doctor_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.created_at DESC LIMIT 5`,
        [req.user.id]
      ),
    ]);

    res.json({
      todayAppointments: todayRes.rows,
      counts: {
        todayTotal: Number(countsRes.rows[0].today_total),
        todayCompleted: Number(countsRes.rows[0].today_completed),
        pendingRequests: Number(countsRes.rows[0].pending_requests),
        totalPatients: Number(countsRes.rows[0].total_patients),
        unreadMessages: Number(unreadRes.rows[0].unread_messages),
      },
      recentConsultations: recentConsultRes.rows,
    });
  } catch (err) { next(err); }
}

// POST /api/doctors/:id/ratings  { appointmentId, rating, comment? }
// A patient can rate a doctor once per COMPLETED appointment they actually
// had with them — enforced both here and by a DB unique constraint on
// appointment_id, so this can't be spammed or duplicated.
async function rateDoctor(req, res, next) {
  try {
    const { appointmentId, rating, comment } = req.body;
    const ratingNum = Number(rating);
    if (!appointmentId) throw new ApiError(400, "appointmentId is required.");
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw new ApiError(400, "rating must be a whole number from 1 to 5.");
    }

    const apptRes = await db.query(
      `SELECT a.*, p.id AS patient_id FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1 AND p.user_id = $2`,
      [appointmentId, req.user.id]
    );
    const appt = apptRes.rows[0];
    if (!appt) throw new ApiError(404, "Appointment not found.");
    if (appt.doctor_id !== req.params.id) throw new ApiError(400, "This appointment was not with this doctor.");
    if (appt.status !== "Completed") throw new ApiError(400, "You can only rate a doctor after a completed appointment.");

    let rows;
    try {
      ({ rows } = await db.query(
        `INSERT INTO doctor_ratings (doctor_id, patient_id, appointment_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, appt.patient_id, appointmentId, ratingNum, comment?.trim() || null]
      ));
    } catch (err) {
      if (err.code === "23505") throw new ApiError(409, "You've already rated this appointment.");
      throw err;
    }
    res.status(201).json({ rating: rows[0] });
  } catch (err) { next(err); }
}

// GET /api/doctors/:id/ratings — public (any authenticated user), reviewer
// identified only by first name + last initial, same privacy level as any
// ordinary review site — never their full name or any clinical detail.
async function listDoctorRatings(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT dr.id, dr.rating, dr.comment, dr.created_at, p.name AS patient_name
       FROM doctor_ratings dr JOIN patients p ON p.id = dr.patient_id
       WHERE dr.doctor_id = $1 ORDER BY dr.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    const ratings = rows.map((r) => {
      const parts = String(r.patient_name || "Patient").trim().split(/\s+/);
      const displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
      return { id: r.id, rating: r.rating, comment: r.comment, createdAt: r.created_at, patientDisplayName: displayName };
    });
    res.json({ ratings });
  } catch (err) { next(err); }
}

// GET /api/doctors/:id/ratings/mine — has the current patient rated this
// doctor for a specific appointment already? Used by the frontend to show
// the rating form only where it's actually allowed.
async function getMyRatableAppointments(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT a.id AS appointment_id, a.scheduled_date
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id = $1 AND p.user_id = $2 AND a.status = 'Completed'
         AND NOT EXISTS (SELECT 1 FROM doctor_ratings dr WHERE dr.appointment_id = a.id)
       ORDER BY a.scheduled_date DESC`,
      [req.params.id, req.user.id]
    );
    res.json({ ratableAppointments: rows });
  } catch (err) { next(err); }
}

// GET /api/doctors/:id/availability
async function getAvailability(req, res, next) {
  try {
    const { rows } = await db.query("SELECT * FROM doctor_availability WHERE doctor_id = $1 ORDER BY day_of_week, start_time", [req.params.id]);
    res.json({ availability: rows });
  } catch (err) { next(err); }
}

// POST /api/doctors/me/availability  { dayOfWeek, startTime, endTime, slotMinutes }
// A doctor manages their own recurring weekly availability.
async function addMyAvailability(req, res, next) {
  try {
    const { dayOfWeek, startTime, endTime, slotMinutes } = req.body;
    if (dayOfWeek == null || !startTime || !endTime) throw new ApiError(400, "dayOfWeek, startTime, and endTime are required.");
    const { rows } = await db.query(
      `INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_minutes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, dayOfWeek, startTime, endTime, slotMinutes || 30]
    );
    res.status(201).json({ availability: rows[0] });
  } catch (err) { next(err); }
}

async function removeMyAvailability(req, res, next) {
  try {
    const { rows } = await db.query(
      "DELETE FROM doctor_availability WHERE id = $1 AND doctor_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new ApiError(404, "Availability window not found.");
    res.json({ success: true });
  } catch (err) { next(err); }
}

// GET /api/doctors/:id/slots?date=YYYY-MM-DD
// Generates real open slots for that date from the doctor's recurring
// availability, minus anything already booked, and respects the doctor's
// own daily patient cap — once reached, no slots are offered for that date.
async function getSlots(req, res, next) {
  try {
    const { date } = req.query;
    if (!date) throw new ApiError(400, "date query parameter (YYYY-MM-DD) is required.");
    const dayOfWeek = new Date(date + "T00:00:00Z").getUTCDay();

    const doctorRes = await db.query("SELECT daily_patient_limit FROM users WHERE id = $1", [req.params.id]);
    const dailyLimit = doctorRes.rows[0]?.daily_patient_limit;

    const bookedRes = await db.query(
      `SELECT scheduled_time FROM appointments
       WHERE doctor_id = $1 AND scheduled_date = $2 AND status IN ('Pending','Confirmed','Rescheduled')`,
      [req.params.id, date]
    );
    const booked = new Set(bookedRes.rows.map((r) => r.scheduled_time.slice(0, 5)));

    if (dailyLimit != null && bookedRes.rows.length >= dailyLimit) {
      return res.json({ slots: [], full: true });
    }

    const availRes = await db.query(
      "SELECT * FROM doctor_availability WHERE doctor_id = $1 AND day_of_week = $2",
      [req.params.id, dayOfWeek]
    );
    if (availRes.rows.length === 0) return res.json({ slots: [], full: false });

    const slots = [];
    const now = Date.now();
    for (const window of availRes.rows) {
      let [h, m] = window.start_time.slice(0, 5).split(":").map(Number);
      const [endH, endM] = window.end_time.slice(0, 5).split(":").map(Number);
      const step = window.slot_minutes;
      while (h < endH || (h === endH && m < endM)) {
        const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        // Skip times already in the past when the requested date is today.
        const slotTime = new Date(`${date}T${label}`).getTime();
        if (!booked.has(label) && slotTime > now) slots.push(label);
        m += step;
        if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
      }
    }
    res.json({ slots, full: false });
  } catch (err) { next(err); }
}

module.exports = {
  computeStatus,
  getMyProfile, updateMyProfile,
  listMySpecialties, addMySpecialty, removeMySpecialty,
  list,
  rateDoctor, listDoctorRatings, getMyRatableAppointments,
  getMyCapacity, setMyCapacity,
  getMyDashboard,
  getAvailability, addMyAvailability, removeMyAvailability,
  getSlots,
};
