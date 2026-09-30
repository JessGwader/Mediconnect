const express = require("express");
const router = express.Router({ mergeParams: true }); // mounted at /api/patients/:patientId/documents
const { requireAuth, requireRole } = require("../middleware/auth");
const { upload } = require("../utils/uploads");
const documents = require("../controllers/documents");

router.use(requireAuth);

router.get("/", documents.list);
router.post("/", requireRole("Doctor", "Specialist", "Administrator", "Patient"), upload.single("file"), documents.create);
router.get("/:id/download", documents.download);

module.exports = router;
