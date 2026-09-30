const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const admin = require("../controllers/admin");

// Every route here requires Administrator — patients and doctors get 403.
router.use(requireAuth, requireRole("Administrator"));

router.get("/me/profile", admin.getMyProfile);
router.patch("/me/profile", admin.updateMyProfile);
router.get("/users", admin.listUsers);
router.patch("/users/:id/status", admin.setUserStatus);
router.get("/audit-log", admin.getAuditLog);

module.exports = router;
