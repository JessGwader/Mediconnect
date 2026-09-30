const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const patients = require("../controllers/patients");

router.use(requireAuth);

router.get("/", requireRole("Doctor", "Specialist", "Administrator"), patients.list);
router.get("/me", requireRole("Patient"), patients.getMine);
router.patch("/me", requireRole("Patient"), patients.updateMine);
router.get("/:id", patients.getOne);
router.get("/:id/transfer-package", patients.getTransferPackage);

module.exports = router;
