const crypto = require("crypto");
const db = require("../db");
const { initiatePayment, verifyPayment } = require("../services/campayService");
const { sendMail, templates } = require("../services/emailService");
const { logAction, notify } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");

// Flat consultation fee, in XAF. The amount is never taken from the client —
// this closes a real gap the old CinetPay flow had, where the patient's
// browser could send any amount it liked.
const CONSULTATION_FEE_XAF = 5000;

// A Cameroon mobile number: optional +237/237 prefix, then 9 digits starting 6.
const PHONE_RE = /^(?:\+?237)?6\d{8}$/;

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  const match = digits.match(PHONE_RE);
  if (!match) return null;
  const local = digits.replace(/^\+?237/, "");
  return `237${local}`;
}

// POST /api/payments/initiate  { appointmentId, phone }
// Creates a Pending payment row for the fixed consultation fee, then asks
// Campay to push a payment prompt to the patient's phone. No redirect — the
// patient stays in MediConnect and confirms with their mobile money PIN.
async function initiate(req, res, next) {
  try {
    const { appointmentId, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw new ApiError(400, "Enter a valid Cameroon mobile money number (MTN or Orange).");

    const patientRes = await db.query("SELECT id, name FROM patients WHERE user_id = $1", [req.user.id]);
    const patient = patientRes.rows[0];
    if (!patient) throw new ApiError(404, "Patient record not found.");

    const amount = CONSULTATION_FEE_XAF;
    const currency = "XAF";
    const transactionRef = `MC-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const inserted = await db.query(
      `INSERT INTO payments (patient_id, appointment_id, amount, currency, provider, transaction_ref, status)
       VALUES ($1,$2,$3,$4,'Campay',$5,'Pending') RETURNING *`,
      [patient.id, appointmentId || null, amount, currency, transactionRef]
    );

    const result = await initiatePayment({
      transactionId: transactionRef,
      amount,
      currency,
      phone: normalizedPhone,
      description: appointmentId ? "MediConnect appointment payment" : "MediConnect payment",
    });

    const withReference = await db.query(
      "UPDATE payments SET provider_metadata = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [JSON.stringify({ providerReference: result.providerReference, ...result.raw }), inserted.rows[0].id]
    );

    await logAction(req.user, `Initiated payment ${transactionRef} (${amount} ${currency}) via Campay`, "payment", inserted.rows[0].id);
    res.status(201).json({ payment: withReference.rows[0] });
  } catch (err) { next(err); }
}

// POST /api/payments/webhook — called by Campay itself. We never trust the
// payload's own claim of success; we always call verifyPayment() to ask
// Campay directly what the real status is before touching our database.
async function webhook(req, res, next) {
  try {
    const transactionRef = req.body.external_reference;
    if (!transactionRef) return res.status(400).json({ error: "Missing external_reference." });

    const paymentRes = await db.query("SELECT * FROM payments WHERE transaction_ref = $1", [transactionRef]);
    const payment = paymentRes.rows[0];
    if (!payment) return res.status(404).json({ error: "Unknown transaction." });

    const providerReference = payment.provider_metadata?.providerReference || req.body.reference;
    const result = await verifyPayment(providerReference);
    const updatedRes = await db.query(
      "UPDATE payments SET status = $1, provider_metadata = provider_metadata || $2, updated_at = now() WHERE transaction_ref = $3 RETURNING *",
      [result.status, JSON.stringify({ lastWebhook: result.raw }), transactionRef]
    );
    const updated = updatedRes.rows[0];
    if (updated && result.status === "Successful") {
      const patientRes = await db.query(
        "SELECT p.name, u.id AS user_id, u.email FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1",
        [updated.patient_id]
      );
      const p = patientRes.rows[0];
      if (p) {
        await notify(p.user_id, `Payment of ${updated.amount} ${updated.currency} confirmed.`);
        await sendMail(p.email, "Payment confirmed", templates.paymentConfirmed(p.name, updated.amount, updated.currency, transactionRef));
      }
      await logAction(null, `Payment ${transactionRef} verified as Successful via Campay`, "payment", updated.id);
    } else if (updated && result.status === "Failed") {
      const patientRes = await db.query(
        "SELECT u.id AS user_id FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = $1",
        [updated.patient_id]
      );
      const p = patientRes.rows[0];
      if (p) {
        await notify(p.user_id, `Your payment of ${updated.amount} ${updated.currency} did not go through. You can try again from the appointment.`);
      }
      await logAction(null, `Payment ${transactionRef} verified as Failed via Campay`, "payment", updated.id);
    }
    res.json({ received: true });
  } catch (err) { next(err); }
}

// GET /api/payments/:transactionRef/status — the frontend polls this after
// initiating, since Campay's flow is a phone PIN prompt rather than a
// redirect, in case the webhook is delayed.
async function getStatus(req, res, next) {
  try {
    const { rows } = await db.query("SELECT * FROM payments WHERE transaction_ref = $1", [req.params.transactionRef]);
    const payment = rows[0];
    if (!payment) throw new ApiError(404, "Payment not found.");

    if (req.user.role === "Patient") {
      const own = await db.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [payment.patient_id, req.user.id]);
      if (!own.rows[0]) throw new ApiError(403, "Not your payment.");
    }

    // If still pending, actively re-check with Campay rather than just
    // returning a stale "Pending" — the patient's polling loop is a good
    // moment to confirm whether they've entered their PIN yet.
    if (payment.status === "Pending") {
      const providerReference = payment.provider_metadata?.providerReference;
      if (providerReference) {
        const result = await verifyPayment(providerReference);
        if (result.status !== "Pending") {
          const updated = await db.query(
            "UPDATE payments SET status = $1, provider_metadata = provider_metadata || $2, updated_at = now() WHERE id = $3 RETURNING *",
            [result.status, JSON.stringify({ lastCheck: result.raw }), payment.id]
          );
          return res.json({ payment: updated.rows[0] });
        }
      }
    }
    res.json({ payment });
  } catch (err) { next(err); }
}

// GET /api/payments — history, scoped to the caller
async function list(req, res, next) {
  try {
    if (req.user.role === "Patient") {
      const { rows } = await db.query(
        `SELECT pay.* FROM payments pay JOIN patients p ON p.id = pay.patient_id
         WHERE p.user_id = $1 ORDER BY pay.created_at DESC`,
        [req.user.id]
      );
      return res.json({ payments: rows });
    }
    if (req.user.role === "Administrator") {
      const { rows } = await db.query(
        `SELECT pay.*, p.name AS patient_name FROM payments pay JOIN patients p ON p.id = pay.patient_id
         ORDER BY pay.created_at DESC LIMIT 500`
      );
      return res.json({ payments: rows });
    }
    throw new ApiError(403, "Not authorized to view payment history here.");
  } catch (err) { next(err); }
}

// GET /api/payments/:id/receipt — generates a real downloadable PDF receipt.
// Only available once a payment has actually been verified Successful.
async function downloadReceipt(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT pay.*, p.name AS patient_name, p.mrn,
              d.scheduled_date, d.scheduled_time, doc.name AS doctor_name
       FROM payments pay
       JOIN patients p ON p.id = pay.patient_id
       LEFT JOIN appointments d ON d.id = pay.appointment_id
       LEFT JOIN users doc ON doc.id = d.doctor_id
       WHERE pay.id = $1`,
      [req.params.id]
    );
    const payment = rows[0];
    if (!payment) throw new ApiError(404, "Payment not found.");

    if (req.user.role === "Patient") {
      const own = await db.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [payment.patient_id, req.user.id]);
      if (!own.rows[0]) throw new ApiError(403, "Not your payment.");
    } else if (req.user.role !== "Administrator") {
      throw new ApiError(403, "Not authorized to view this receipt.");
    }
    if (payment.status !== "Successful") {
      throw new ApiError(400, "A receipt is only available for a successfully verified payment.");
    }

    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="receipt-${payment.transaction_ref}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).fillColor("#12233B").text("MediConnect", { continued: false });
    doc.fontSize(11).fillColor("#5A7797").text("Payment Receipt").moveDown(1.5);

    doc.fontSize(10).fillColor("#1B2A22");
    doc.text(`Receipt for: ${payment.patient_name}${payment.mrn ? " (" + payment.mrn + ")" : ""}`);
    doc.text(`Transaction reference: ${payment.transaction_ref}`);
    doc.text(`Provider: ${payment.provider}`);
    doc.text(`Date: ${new Date(payment.updated_at || payment.created_at).toLocaleString()}`);
    if (payment.doctor_name) {
      doc.text(`Doctor: ${payment.doctor_name}`);
    }
    if (payment.scheduled_date) {
      doc.text(`Appointment date: ${String(payment.scheduled_date).slice(0, 10)} at ${String(payment.scheduled_time || "").slice(0, 5)}`);
    }
    doc.moveDown(1);
    doc.fontSize(14).fillColor("#12233B").text(`Amount paid: ${Number(payment.amount).toLocaleString("fr-FR")} ${payment.currency}`, { underline: false });
    doc.moveDown(1);
    doc.fontSize(9).fillColor("#5A7797").text("Status: Verified Successful directly with the payment provider.");
    doc.moveDown(2);
    doc.fontSize(8).fillColor("#8B978F").text("This receipt was generated automatically by MediConnect and does not require a signature.");

    doc.end();
  } catch (err) { next(err); }
}

module.exports = { initiate, webhook, getStatus, list, downloadReceipt };
