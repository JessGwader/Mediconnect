require("dotenv").config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env" });
const express = require("express");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const { secureHeaders, corsPolicy, generalLimiter } = require("./middleware/security");
const { errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const patientRoutes = require("./routes/patients");
const consultationRoutes = require("./routes/consultations");
const prescriptionRoutes = require("./routes/prescriptions");
const appointmentRoutes = require("./routes/appointments");
const documentRoutes = require("./routes/documents");
const doctorApplicationRoutes = require("./routes/doctorApplications");
const notificationRoutes = require("./routes/notifications");
const doctorRoutes = require("./routes/doctors");
const userRoutes = require("./routes/users");
const specialtyRoutes = require("./routes/specialties");
const clinicRoutes = require("./routes/clinics");
const transferRoutes = require("./routes/transfers");
const conversationRoutes = require("./routes/conversations");
const paymentRoutes = require("./routes/payments");
const statisticsRoutes = require("./routes/statistics");
const supportChatRoutes = require("./routes/supportChat");

const app = express();

app.set("trust proxy", 1); // required for correct rate-limiting/secure cookies behind a reverse proxy
app.use(secureHeaders);
app.use(corsPolicy);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", generalLimiter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/users", userRoutes);
app.use("/api/specialties", specialtyRoutes);
app.use("/api/clinics", clinicRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/doctor-applications", doctorApplicationRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/support-topics", supportChatRoutes);

// Nested resources under a specific patient — mergeParams lets these routers
// read :patientId from the parent mount.
app.use("/api/patients/:patientId/consultations", consultationRoutes);
app.use("/api/patients/:patientId/prescriptions", prescriptionRoutes);
app.use("/api/patients/:patientId/documents", documentRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use(errorHandler);

module.exports = app;
