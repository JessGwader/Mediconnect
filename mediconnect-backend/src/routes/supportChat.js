const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const supportChat = require("../controllers/supportChat");

// Patients only — this is a private peer-support space among patients.
// Doctors and administrators intentionally have no visibility into it.
router.use(requireAuth, requireRole("Patient"));

router.get("/", supportChat.listTopics);
router.get("/:id/messages", supportChat.listMessages);
router.post("/:id/messages", supportChat.sendMessage);

module.exports = router;
