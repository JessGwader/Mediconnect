const db = require("../db");
const { logAction } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");

// GET /api/clinics — simple directory listing, backed by the database
// (per spec section 17: search must not be purely frontend filtering).
async function list(req, res, next) {
  try {
    const q = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;
    const { rows } = await db.query(
      q
        ? "SELECT * FROM clinics WHERE LOWER(name) LIKE $1 OR LOWER(city) LIKE $1 ORDER BY name"
        : "SELECT * FROM clinics ORDER BY name",
      q ? [q] : []
    );
    res.json({ clinics: rows });
  } catch (err) { next(err); }
}

// POST /api/clinics  { name, address, city, phone } — admin only.
async function create(req, res, next) {
  try {
    const { name, address, city, phone } = req.body;
    if (!name || !address) throw new ApiError(400, "Name and address are required.");

    const { rows } = await db.query(
      `INSERT INTO clinics (name, address, city, phone) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, address, city || null, phone || null]
    );
    await logAction(req.user, `Created clinic "${name}"`, "clinic", rows[0].id);
    res.status(201).json({ clinic: rows[0] });
  } catch (err) { next(err); }
}

module.exports = { list, create };
