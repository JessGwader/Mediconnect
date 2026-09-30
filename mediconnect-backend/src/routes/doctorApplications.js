const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { upload } = require("../utils/uploads");
const doctorApplications = require("../controllers/doctorApplications");

router.use(requireAuth);

router.post("/", requireRole("Patient"), upload.single("document"), doctorApplications.create);
router.get("/me", requireRole("Patient"), doctorApplications.getMine);
router.get("/", requireRole("Administrator"), doctorApplications.list);
router.patch("/:id", requireRole("Administrator"), doctorApplications.decide);

module.exports = router;
