const db = require("../db");
const { buildInsights } = require("../services/statisticsEngine");
const { startDocument, footer } = require("../services/pdfService");

// Real aggregate queries over the platform's own data, shared by both the
// live dashboard (GET /) and the exportable PDF report (GET /report). No
// patient-identifying detail is included, per spec section 13.
async function gatherStatistics() {
  const [
    counts,
    specialtyDemand,
    appointmentTrend,
    doctorWorkload,
    mostBookedDoctors,
    topRatedDoctors,
    conditionFrequency,
    transferStats,
    paymentStats,
    revenue,
  ] = await Promise.all([
    db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'Patient') AS patients,
        (SELECT COUNT(*) FROM users WHERE role IN ('Doctor','Specialist')) AS doctors,
        (SELECT COUNT(*) FROM appointments) AS appointments,
        (SELECT COUNT(*) FROM appointments WHERE status = 'Completed') AS completed_appointments,
        (SELECT COUNT(*) FROM appointments WHERE status = 'Cancelled') AS cancelled_appointments
    `),
    db.query(`
      SELECT COALESCE(s.name, 'Unspecified') AS specialty, COUNT(a.id) AS count
      FROM specialties s
      LEFT JOIN users u ON u.specialty_id = s.id
      LEFT JOIN appointments a ON a.doctor_id = u.id
      GROUP BY s.name
      ORDER BY count DESC
    `),
    db.query(`
      SELECT to_char(date_trunc('month', scheduled_date), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM appointments
      WHERE scheduled_date >= (CURRENT_DATE - INTERVAL '6 months')
      GROUP BY 1 ORDER BY 1
    `),
    db.query(`
      SELECT u.id, u.name,
        COUNT(a.id) FILTER (WHERE a.status IN ('Pending','Confirmed','Rescheduled')) AS appointment_count
      FROM users u
      LEFT JOIN appointments a ON a.doctor_id = u.id
      WHERE u.role IN ('Doctor','Specialist')
      GROUP BY u.id, u.name
      ORDER BY appointment_count DESC
      LIMIT 10
    `),
    // All-time booking count per doctor — "most booked doctor" is about
    // overall demand, not just what's currently open on their calendar
    // (that's doctorWorkload above, a separate and still-useful metric).
    db.query(`
      SELECT u.id, u.name, s.name AS specialty_name, COUNT(a.id) AS booking_count
      FROM users u
      JOIN appointments a ON a.doctor_id = u.id
      LEFT JOIN specialties s ON s.id = u.specialty_id
      WHERE u.role IN ('Doctor','Specialist')
      GROUP BY u.id, u.name, s.name
      ORDER BY booking_count DESC
      LIMIT 5
    `),
    // Best doctor(s) by rating — a minimum of 2 ratings keeps a single
    // 5-star review from a doctor's first-ever patient from topping the list.
    db.query(`
      SELECT u.id, u.name, s.name AS specialty_name,
             ROUND(AVG(dr.rating)::numeric, 1) AS avg_rating, COUNT(dr.id) AS rating_count
      FROM users u
      JOIN doctor_ratings dr ON dr.doctor_id = u.id
      LEFT JOIN specialties s ON s.id = u.specialty_id
      GROUP BY u.id, u.name, s.name
      HAVING COUNT(dr.id) >= 2
      ORDER BY avg_rating DESC, rating_count DESC
      LIMIT 5
    `),
    db.query(`
      SELECT diagnosis, COUNT(*) AS count
      FROM consultations
      WHERE diagnosis IS NOT NULL AND diagnosis != '' AND deleted_at IS NULL
      GROUP BY diagnosis
      ORDER BY count DESC
      LIMIT 8
    `),
    db.query(`SELECT status, COUNT(*) AS count FROM transfers GROUP BY status`),
    db.query(`SELECT status, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM payments GROUP BY status`),
    db.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'Successful'`),
  ]);

  const specialtyDemandRows = specialtyDemand.rows.map((r) => ({ specialty: r.specialty, count: Number(r.count) }));
  const appointmentTrendRows = appointmentTrend.rows.map((r) => ({ month: r.month, count: Number(r.count) }));
  const doctorWorkloadRows = doctorWorkload.rows.map((r) => ({ id: r.id, name: r.name, appointment_count: Number(r.appointment_count) }));
  const conditionFrequencyRows = conditionFrequency.rows.map((r) => ({ diagnosis: r.diagnosis, count: Number(r.count) }));
  const mostBookedDoctorRows = mostBookedDoctors.rows.map((r) => ({ id: r.id, name: r.name, specialtyName: r.specialty_name, bookingCount: Number(r.booking_count) }));
  const topRatedDoctorRows = topRatedDoctors.rows.map((r) => ({ id: r.id, name: r.name, specialtyName: r.specialty_name, avgRating: Number(r.avg_rating), ratingCount: Number(r.rating_count) }));

  // Booking trend: this month-in-progress vs the prior full month, so the
  // admin can see at a glance whether bookings are trending up or down.
  let bookingTrend = { direction: "flat", deltaPct: 0, currentMonthCount: 0, previousMonthCount: 0 };
  if (appointmentTrendRows.length >= 2) {
    const current = appointmentTrendRows[appointmentTrendRows.length - 1];
    const previous = appointmentTrendRows[appointmentTrendRows.length - 2];
    const deltaPct = previous.count > 0 ? Math.round(((current.count - previous.count) / previous.count) * 100) : (current.count > 0 ? 100 : 0);
    bookingTrend = {
      direction: current.count > previous.count ? "up" : current.count < previous.count ? "down" : "flat",
      deltaPct, currentMonthCount: current.count, previousMonthCount: previous.count,
    };
  }

  const { insights, source } = await buildInsights({
    specialtyDemand: specialtyDemandRows,
    appointmentTrend: appointmentTrendRows,
    doctorWorkload: doctorWorkloadRows,
    conditionFrequency: conditionFrequencyRows,
  });

  return {
    counts: counts.rows[0],
    specialtyDemand: specialtyDemandRows,
    appointmentTrend: appointmentTrendRows,
    doctorWorkload: doctorWorkloadRows,
    mostBookedDoctors: mostBookedDoctorRows,
    topRatedDoctors: topRatedDoctorRows,
    bookingTrend,
    conditionFrequency: conditionFrequencyRows,
    transferStats: transferStats.rows,
    paymentStats: paymentStats.rows,
    totalRevenue: Number(revenue.rows[0].total),
    insights,
    insightsSource: source, // 'gemini' | 'rule-based' — lets the admin UI show whether Gemini actually ran
    generatedOn: new Date().toISOString(),
    disclaimer: "These are automated statistics and pattern summaries intended to support resource-allocation decisions. They are not clinical advice and do not identify individual patients.",
  };
}

// GET /api/statistics — live dashboard data
async function getDashboard(req, res, next) {
  try {
    res.json(await gatherStatistics());
  } catch (err) { next(err); }
}

// POST /api/statistics/generate-insights — re-runs just the Gemini/rule-based
// insight step on demand (e.g. an admin clicking "Generate insights"), so
// there's a direct, visible way to confirm Gemini is actually configured and
// responding, without waiting for the whole dashboard's SQL to re-run.
async function regenerateInsights(req, res, next) {
  try {
    const stats = await gatherStatistics();
    res.json({ insights: stats.insights, insightsSource: stats.insightsSource, generatedOn: stats.generatedOn });
  } catch (err) { next(err); }
}

// GET /api/statistics/report — the same data, exported as a real
// downloadable PDF snapshot for record-keeping (distinct from the live dashboard).
async function downloadReport(req, res, next) {
  try {
    const stats = await gatherStatistics();
    const doc = startDocument(res, {
      filename: `mediconnect-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      subtitle: "Administrative Statistics Report",
    });

    doc.text(`Generated: ${new Date(stats.generatedOn).toLocaleString()}`).moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text("Platform overview");
    doc.fontSize(10).fillColor("#1B2A22");
    doc.text(`Patients: ${stats.counts.patients}    Doctors: ${stats.counts.doctors}`);
    doc.text(`Appointments: ${stats.counts.appointments}  (Completed: ${stats.counts.completed_appointments}, Cancelled: ${stats.counts.cancelled_appointments})`);
    doc.text(`Total revenue (successful payments): ${stats.totalRevenue.toLocaleString("fr-FR")} XAF`);
    doc.text(`Booking trend: ${stats.bookingTrend.direction} (${stats.bookingTrend.deltaPct >= 0 ? "+" : ""}${stats.bookingTrend.deltaPct}% vs previous month)`);
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text("Most booked doctors (all-time)");
    doc.fontSize(10).fillColor("#1B2A22");
    if (stats.mostBookedDoctors.length === 0) doc.text("No bookings yet.");
    stats.mostBookedDoctors.forEach((d) => doc.text(`${d.name}${d.specialtyName ? " (" + d.specialtyName + ")" : ""}: ${d.bookingCount} booking(s)`));
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text("Top-rated doctors (2+ ratings)");
    doc.fontSize(10).fillColor("#1B2A22");
    if (stats.topRatedDoctors.length === 0) doc.text("Not enough rating data yet.");
    stats.topRatedDoctors.forEach((d) => doc.text(`${d.name}${d.specialtyName ? " (" + d.specialtyName + ")" : ""}: ${d.avgRating}/5 (${d.ratingCount} ratings)`));
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text("Specialty demand");
    doc.fontSize(10).fillColor("#1B2A22");
    stats.specialtyDemand.forEach((s) => doc.text(`${s.specialty}: ${s.count}`));
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text("Doctor workload (top 10)");
    doc.fontSize(10).fillColor("#1B2A22");
    stats.doctorWorkload.forEach((d) => doc.text(`${d.name}: ${d.appointment_count} open appointment(s)`));
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text("Most frequent diagnoses");
    doc.fontSize(10).fillColor("#1B2A22");
    if (stats.conditionFrequency.length === 0) doc.text("No data yet.");
    stats.conditionFrequency.forEach((c) => doc.text(`${c.diagnosis}: ${c.count}`));
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text("Payments");
    doc.fontSize(10).fillColor("#1B2A22");
    stats.paymentStats.forEach((p) => doc.text(`${p.status}: ${p.count} transaction(s), ${p.total} total`));
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#12233B").text(`Insights (source: ${stats.insightsSource === "gemini" ? "Gemini AI" : "rule-based fallback"})`);
    doc.fontSize(10).fillColor("#1B2A22");
    stats.insights.forEach((i) => doc.text(`• ${i}`));

    footer(doc, stats.disclaimer);
    doc.end();
  } catch (err) { next(err); }
}

module.exports = { gatherStatistics, getDashboard, regenerateInsights, downloadReport };
