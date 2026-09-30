const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const notifications = require("../controllers/notifications");

router.use(requireAuth);

router.get("/", notifications.list);
router.patch("/:id/read", notifications.markRead);

module.exports = router;
