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
  // NOTE: the correct path is /api/transaction/{reference}/ — no "/status"
  // segment. That extra segment was hitting a route that doesn't exist on
  // Campay's API, so every check came back as an error body with no
  // "status" field at all — which is exactly the "undefined" status being
  // logged, and why the UI looked permanently stuck on "Pending" even after
  // a real success/failure on Campay's side.
  const res = await fetch(`${BASE_URL}/api/transaction/${providerReference}/`, {
    headers: { Authorization: `Token ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A non-200 here (wrong path, bad reference, etc.) has no "status" to
    // read — surface the real HTTP status instead of quietly treating it
    // as "Pending", which is what made this bug invisible before.
    console.warn(`Campay transaction lookup failed with HTTP ${res.status} for reference ${providerReference}:`, data);
    return { status: "Pending", raw: data };
  }
  // Matched case-insensitively: Campay has been observed returning the
  // status in different casing across API versions/sandboxes, and an exact
  // uppercase-only match silently fell through to "Pending" forever — which
  // looked exactly like a stuck payment even after a real success/failure.
  const statusMap = {
    SUCCESSFUL: "Successful",
    SUCCESS: "Successful",
    FAILED: "Failed",
    FAILURE: "Failed",
    PENDING: "Pending",
  };
  const rawStatus = String(data.status || "").toUpperCase();
  const mapped = statusMap[rawStatus];
  if (!mapped) {
    // Don't silently guess on an unrecognized status — log it so it's
    // debuggable, since defaulting to "Pending" is exactly the behavior
    // that hides a provider-side change in terminology.
    console.warn(`Campay returned an unrecognized status "${data.status}" for reference ${providerReference}:`, data);
  }
  return { status: mapped || "Pending", raw: data };
}

module.exports = { initiatePayment, verifyPayment };
