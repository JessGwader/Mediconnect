const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const transfers = require("../controllers/transfers");

router.use(requireAuth);

router.get("/", transfers.list);
router.post("/", requireRole("Doctor", "Specialist"), transfers.create);
router.patch("/:id", transfers.update);
router.get("/:id/referral-letter", transfers.downloadReferralLetter);

module.exports = router;
