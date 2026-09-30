const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const clinics = require("../controllers/clinics");

router.get("/", requireAuth, clinics.list);
router.post("/", requireAuth, requireRole("Administrator"), clinics.create);

module.exports = router;
