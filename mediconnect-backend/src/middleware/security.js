const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// Secure HTTP headers (HSTS, no-sniff, frameguard, CSP baseline, etc.)
const secureHeaders = helmet();

// Locked-down CORS: only the configured origin may call the API with credentials.
const corsPolicy = cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
});

// General API rate limit — mitigates scraping / brute force across all routes.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

// Tighter limiter specifically on login/register to blunt credential-stuffing
// and brute-force attempts against auth endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});

module.exports = { secureHeaders, corsPolicy, generalLimiter, authLimiter };
