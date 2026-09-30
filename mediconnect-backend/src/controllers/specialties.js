const db = require("../db");
const { logAction } = require("../middleware/audit");
const { ApiError } = require("../middleware/errorHandler");

// GET /api/specialties — public to any authenticated user (needed for search/filter UI)
async function list(req, res, next) {
  try {
    const { rows } = await db.query("SELECT * FROM specialties ORDER BY name");
    res.json({ specialties: rows });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!name) throw new ApiError(400, "Specialty name is required.");
    const { rows } = await db.query(
      "INSERT INTO specialties (name, description) VALUES ($1,$2) RETURNING *",
      [name, description || null]
    );
    await logAction(req.user, `Created specialty "${name}"`, "specialty", rows[0].id);
    res.status(201).json({ specialty: rows[0] });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const { rows } = await db.query("DELETE FROM specialties WHERE id = $1 RETURNING id, name", [req.params.id]);
    if (!rows[0]) throw new ApiError(404, "Specialty not found.");
    await logAction(req.user, `Deleted specialty "${rows[0].name}"`, "specialty", rows[0].id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, create, remove };
