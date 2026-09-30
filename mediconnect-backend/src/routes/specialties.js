const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const specialties = require("../controllers/specialties");

router.get("/", requireAuth, specialties.list);
router.post("/", requireAuth, requireRole("Administrator"), specialties.create);
router.delete("/:id", requireAuth, requireRole("Administrator"), specialties.remove);

module.exports = router;
