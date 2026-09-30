const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const statistics = require("../controllers/statistics");

router.use(requireAuth, requireRole("Administrator"));

router.get("/", statistics.getDashboard);
router.post("/generate-insights", statistics.regenerateInsights);
router.get("/report", statistics.downloadReport);

module.exports = router;
