const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../utils/uploads");
const users = require("../controllers/users");

router.use(requireAuth);

router.post("/me/avatar", upload.single("file"), users.uploadAvatar);
router.delete("/me/avatar", users.removeAvatar);
router.get("/:id/avatar", users.getAvatar);

module.exports = router;
