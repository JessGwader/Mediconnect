const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const appointments = require("../controllers/appointments");

router.use(requireAuth);

router.get("/", appointments.list);
router.post("/", requireRole("Patient"), appointments.create);
router.patch("/:id", requireRole("Doctor", "Specialist"), appointments.updateStatus);
router.patch("/:id/reschedule", requireRole("Patient"), appointments.reschedule);
router.patch("/:id/cancel", requireRole("Patient"), appointments.cancel);

module.exports = router;
