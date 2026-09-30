const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const doctors = require("../controllers/doctors");

router.use(requireAuth);

router.get("/me/profile", requireRole("Doctor", "Specialist"), doctors.getMyProfile);
router.get("/me/specialties", requireRole("Specialist"), doctors.listMySpecialties);
router.post("/me/specialties", requireRole("Specialist"), doctors.addMySpecialty);
router.delete("/me/specialties/:id", requireRole("Specialist"), doctors.removeMySpecialty);
router.patch("/me/profile", requireRole("Doctor", "Specialist"), doctors.updateMyProfile);
router.get("/", doctors.list);
router.post("/:id/ratings", requireRole("Patient"), doctors.rateDoctor);
router.get("/:id/ratings", doctors.listDoctorRatings);
router.get("/:id/ratable-appointments", requireRole("Patient"), doctors.getMyRatableAppointments);
router.get("/me/capacity", requireRole("Doctor", "Specialist"), doctors.getMyCapacity);
router.patch("/me/capacity", requireRole("Doctor", "Specialist"), doctors.setMyCapacity);
router.get("/me/dashboard", requireRole("Doctor", "Specialist"), doctors.getMyDashboard);
router.get("/:id/availability", doctors.getAvailability);
router.post("/me/availability", requireRole("Doctor", "Specialist"), doctors.addMyAvailability);
router.delete("/me/availability/:id", requireRole("Doctor", "Specialist"), doctors.removeMyAvailability);
router.get("/:id/slots", doctors.getSlots);

module.exports = router;
