const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const { authLimiter } = require("../middleware/security");
const auth = require("../controllers/auth");

router.post("/register", authLimiter, auth.register);
router.post("/login", authLimiter, auth.login);
router.post("/2fa/login-verify", authLimiter, auth.loginVerify2FA);
router.post("/refresh", auth.refresh);
router.post("/logout", requireAuth, auth.logout);
router.get("/me", requireAuth, auth.getMe);

router.get("/2fa/status", requireAuth, auth.get2FAStatus);
router.post("/2fa/setup", requireAuth, auth.setup2FA);
router.post("/2fa/enable", requireAuth, auth.enable2FA);
router.post("/2fa/disable", requireAuth, auth.disable2FA);

router.post("/change-password", requireAuth, auth.changePassword);
router.post("/verify-email", auth.verifyEmail);
router.post("/request-password-reset", authLimiter, auth.requestPasswordReset);
router.post("/reset-password", authLimiter, auth.resetPassword);

module.exports = router;
