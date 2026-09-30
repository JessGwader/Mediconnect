/**
 * Campay integration (MTN Mobile Money + Orange Money, Cameroon).
 *
 * Docs: https://documenter.getpostman.com/view/2391374/T1LV8PVA — verify
 * exact field names/paths there before going live; payment provider APIs
 * change, and this follows Campay's shape as of this writing. Requires a
 * real Campay merchant account for: CAMPAY_APP_USERNAME, CAMPAY_APP_PASSWORD.
 *
 * Unlike CinetPay's hosted checkout page, Campay's /collect/ endpoint pushes
 * a PIN prompt straight to the patient's phone — there is no redirect, so
 * the whole payment UI stays inside MediConnect. The patient picks an
 * operator (MTN or Orange) for clarity, but Campay itself detects the real
 * operator from the phone number prefix; we don't send the operator choice
 * as a separate field, only the number.
 *
 * Critical rule this module enforces, unchanged from the CinetPay version:
 * a payment is only ever marked "Successful" in our database after calling
 * Campay's own transaction-status endpoint and reading their status back —
 * never because the frontend said so, and never purely from an unverified
 * webhook payload.
 */

const BASE_URL = process.env.CAMPAY_BASE_URL || "https://api.campay.net";

function requireConfig() {
  if (!process.env.CAMPAY_APP_USERNAME || !process.env.CAMPAY_APP_PASSWORD) {
    const err = new Error("Payment provider is not configured (CAMPAY_APP_USERNAME / CAMPAY_APP_PASSWORD missing).");
    err.status = 503;
    throw err;
  }
}

// Access tokens are short-lived; cache in memory and re-fetch a little before
// they actually expire rather than requesting a fresh one on every call.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  requireConfig();
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const res = await fetch(`${BASE_URL}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.CAMPAY_APP_USERNAME,
      password: process.env.CAMPAY_APP_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!data.token) {
    const err = new Error(`Campay rejected the token request: ${data.message || "unknown error"}`);
    err.status = 502;
    err.providerResponse = data;
    throw err;
  }
  cachedToken = data.token;
  // Campay tokens are typically valid ~1 hour; refresh a few minutes early.
  cachedTokenExpiresAt = Date.now() + 50 * 60 * 1000;
  return cachedToken;
}

/**
 * @param {object} params
 * @param {string} params.transactionId - our own unique reference (external_reference)
 * @param {number} params.amount
 * @param {string} params.currency - "XAF"
 * @param {string} params.phone - patient's mobile money number, e.g. "237670000000"
 * @param {string} params.description
 */
async function initiatePayment({ transactionId, amount, currency, phone, description }) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/api/collect/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
    body: JSON.stringify({
      amount: String(Math.round(Number(amount))),
      currency: currency || "XAF",
      from: phone,
      description: description || "MediConnect payment",
      external_reference: transactionId,
    }),
  });
  const data = await res.json();
  if (!data.reference) {
    const err = new Error(`Campay rejected the payment request: ${data.message || data.detail || "unknown error"}`);
    err.status = 502;
    err.providerResponse = data;
    throw err;
  }
  return {
    providerReference: data.reference,
    raw: data,
  };
}

/**
 * The ONLY function allowed to mark a payment successful. Always calls
 * Campay directly rather than trusting a client-supplied or webhook status.
 * @returns {{ status: 'Successful'|'Failed'|'Pending', raw: object }}
 */
async function verifyPayment(providerReference) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/api/transaction/status/${providerReference}/`, {
    headers: { Authorization: `Token ${token}` },
  });
  const data = await res.json();
  const statusMap = {
    SUCCESSFUL: "Successful",
    FAILED: "Failed",
    PENDING: "Pending",
  };
  return { status: statusMap[data.status] || "Pending", raw: data };
}

module.exports = { initiatePayment, verifyPayment };
