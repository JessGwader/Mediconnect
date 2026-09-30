const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../utils/uploads");
const conversations = require("../controllers/conversations");

router.use(requireAuth);

router.get("/", conversations.list);
router.post("/", conversations.getOrCreate);
router.get("/:id/messages", conversations.listMessages);
router.post("/:id/attachments", upload.single("file"), conversations.uploadAttachment);
router.post("/:id/messages", conversations.sendMessage);

module.exports = router;
