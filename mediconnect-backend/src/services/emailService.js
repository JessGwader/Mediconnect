const nodemailer = require("nodemailer");

// Real Gmail SMTP transport. Requires a Google Account "App Password"
// (Google Account → Security → 2-Step Verification → App passwords) —
// regular account passwords won't authenticate here.
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("GMAIL_USER / GMAIL_APP_PASSWORD not set — emails will be logged, not sent.");
    return null;
  }
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return transporter;
}

async function sendMail(to, subject, html) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email:not-configured] To: ${to} | Subject: ${subject}`);
    return { sent: false, reason: "SMTP not configured" };
  }
  try {
    await t.sendMail({ from: `"MediConnect" <${process.env.GMAIL_USER}>`, to, subject, html });
    return { sent: true };
  } catch (err) {
    console.error("Failed to send email:", err.message);
    return { sent: false, reason: err.message };
  }
}

function wrap(title, bodyHtml) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1B2A22;">
    <h2 style="color:#12233B;margin-bottom:16px;">${title}</h2>
    ${bodyHtml}
    <p style="font-size:12px;color:#5A7797;margin-top:28px;">MediConnect — this is an automated message, please do not reply directly to this email.</p>
  </div>`;
}

const templates = {
  verifyEmail: (name, link) => wrap("Verify your MediConnect account", `
    <p>Hi ${name},</p>
    <p>Thanks for registering with MediConnect. Please confirm your email address to activate your account:</p>
    <p><a href="${link}" style="background:#12233B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Verify email</a></p>
    <p>This link expires in 24 hours.</p>`),

  passwordReset: (name, link) => wrap("Reset your MediConnect password", `
    <p>Hi ${name},</p>
    <p>We received a request to reset your password. If this was you, click below:</p>
    <p><a href="${link}" style="background:#12233B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Reset password</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`),

  appointmentConfirmed: (name, doctorName, date, time) => wrap("Appointment confirmed", `
    <p>Hi ${name},</p>
    <p>Your appointment with <strong>${doctorName}</strong> on <strong>${date} at ${time}</strong> has been confirmed.</p>`),

  appointmentCancelled: (name, doctorName, date, time) => wrap("Appointment cancelled", `
    <p>Hi ${name},</p>
    <p>Your appointment with <strong>${doctorName}</strong> on <strong>${date} at ${time}</strong> has been cancelled.</p>`),

  appointmentReminder: (name, doctorName, date, time) => wrap("Upcoming appointment reminder", `
    <p>Hi ${name},</p>
    <p>Reminder: you have an appointment with <strong>${doctorName}</strong> on <strong>${date} at ${time}</strong>.</p>`),

  transferNotice: (name, detail) => wrap("Patient transfer update", `<p>Hi ${name},</p><p>${detail}</p>`),

  doctorApplicationReceived: (name) => wrap("We've received your doctor application", `
    <p>Hi ${name},</p>
    <p>Thanks for applying for a doctor/specialist account. Your application is now <strong>pending review</strong> by an administrator, and your account will be on hold until that review is complete.</p>
    <p>You'll get another email — and can sign back in — as soon as a decision has been made.</p>`),

  doctorApplicationApproved: (name, role) => wrap("Your MediConnect doctor account is verified", `
    <p>Hi ${name},</p>
    <p>Good news — an administrator has reviewed and <strong>approved</strong> your doctor verification application. Your account now has ${role} access.</p>
    <p>Sign in again to see your clinical dashboard.</p>`),

  doctorApplicationRejected: (name) => wrap("Update on your doctor verification application", `
    <p>Hi ${name},</p>
    <p>An administrator has reviewed your doctor verification application and was unable to approve it at this time.</p>
    <p>Your account is active again and you can sign back in as a patient. If you believe this is a mistake, or would like more detail, please contact an administrator.</p>`),

  paymentConfirmed: (name, amount, currency, ref) => wrap("Payment confirmed", `
    <p>Hi ${name},</p>
    <p>We've confirmed your payment of <strong>${amount} ${currency}</strong>.</p>
    <p>Transaction reference: <span style="font-family:monospace;">${ref}</span></p>`),
};

module.exports = { sendMail, templates };
