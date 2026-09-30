const express = require("express");
const router = express.Router({ mergeParams: true }); // mounted at /api/patients/:patientId/consultations
const { requireAuth, requireRole } = require("../middleware/auth");
const consultations = require("../controllers/consultations");

router.use(requireAuth);

router.get("/", consultations.list);
router.post("/", requireRole("Doctor", "Specialist"), consultations.create);
router.patch("/:id", requireRole("Doctor", "Specialist"), consultations.update);
router.delete("/:id", requireRole("Administrator"), consultations.remove);

module.exports = router;
