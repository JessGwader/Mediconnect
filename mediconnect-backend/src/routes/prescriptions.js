const express = require("express");
const router = express.Router({ mergeParams: true }); // mounted at /api/patients/:patientId/prescriptions
const { requireAuth, requireRole } = require("../middleware/auth");
const prescriptions = require("../controllers/prescriptions");

router.use(requireAuth);

router.get("/", prescriptions.list);
router.post("/", requireRole("Doctor", "Specialist"), prescriptions.create);
router.patch("/:id", requireRole("Doctor", "Specialist"), prescriptions.update);
router.get("/:id/pdf", prescriptions.downloadPdf);

module.exports = router;
