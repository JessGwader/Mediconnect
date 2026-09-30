/**
 * Minimal RFC 6238 (TOTP) / RFC 4226 (HOTP) implementation using only
 * Node's built-in crypto — no third-party authenticator library needed.
 * Compatible with Google Authenticator, Authy, and any standard app that
 * reads an otpauth:// URI (30s step, 6 digits, SHA-1, per the RFC defaults
 * every mainstream authenticator app assumes).
 */
const crypto = require("crypto");

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    const chunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// A random 20-byte secret, base32-encoded for display / QR-less manual entry.
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** DIGITS).padStart(DIGITS, "0");
}

function totpAt(secretBase32, timeMs) {
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  return hotp(secretBase32, counter);
}

// Accepts the current 30s window plus one step of clock drift either way —
// the same tolerance virtually every TOTP implementation uses, since phone
// and server clocks are never perfectly in sync.
function verifyToken(secretBase32, token, windowSteps = 1) {
  if (!/^\d{6}$/.test(String(token || "").trim())) return false;
  const clean = String(token).trim();
  const now = Date.now();
  for (let errorWindow = -windowSteps; errorWindow <= windowSteps; errorWindow++) {
    const candidate = totpAt(secretBase32, now + errorWindow * STEP_SECONDS * 1000);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}

function otpauthUrl(secretBase32, accountEmail, issuer = "MediConnect") {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, verifyToken, otpauthUrl };
