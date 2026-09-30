const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const payments = require("../controllers/payments");

router.post("/initiate", requireAuth, requireRole("Patient"), payments.initiate);
router.post("/webhook", express.json(), payments.webhook);
router.get("/:transactionRef/status", requireAuth, payments.getStatus);
router.get("/", requireAuth, payments.list);
router.get("/:id/receipt", requireAuth, payments.downloadReceipt);

module.exports = router;
