// Centralized error handler — keeps stack traces and raw DB errors out of API
// responses (which could leak schema details), while logging them server-side.
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === "23505") { // Postgres unique_violation
    return res.status(409).json({ error: "A record with these details already exists." });
  }
  if (err.code === "23503") { // foreign_key_violation
    return res.status(400).json({ error: "Referenced record does not exist." });
  }

  const status = err.status || 500;
  const message = status === 500 ? "An unexpected error occurred." : err.message;
  res.status(status).json({ error: message });
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { errorHandler, ApiError };
