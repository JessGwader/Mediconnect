import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SocketProvider } from "./context/SocketContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";

import { AuthPage } from "./pages/auth/AuthPage";
import { LandingPage } from "./pages/LandingPage";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { ResetPassword } from "./pages/auth/ResetPassword";

import { PatientDashboard } from "./pages/patient/PatientDashboard";
import { FindDoctor } from "./pages/patient/FindDoctor";
import { DoctorProfile as DoctorProfileView } from "./pages/patient/DoctorProfile";
import { PatientRecords } from "./pages/patient/PatientRecords";
import { PatientProfile } from "./pages/patient/PatientProfile";

import { DoctorQueue } from "./pages/doctor/DoctorQueue";
import { DoctorDashboard } from "./pages/doctor/DoctorDashboard";
import { PatientDetail } from "./pages/doctor/PatientDetail";
import { Availability } from "./pages/doctor/Availability";
import { DoctorProfile as DoctorOwnProfile } from "./pages/doctor/DoctorProfile";

import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminDoctorApplications } from "./pages/admin/AdminDoctorApplications";
import { AdminStatistics } from "./pages/admin/AdminStatistics";
import { AdminSpecialties } from "./pages/admin/AdminSpecialties";
import { AdminClinics } from "./pages/admin/AdminClinics";
import { AdminAuditLog } from "./pages/admin/AdminAuditLog";
import { AdminAppointments } from "./pages/admin/AdminAppointments";
import { AdminProfile } from "./pages/admin/AdminProfile";

import { Appointments } from "./pages/Appointments";
import { Messages } from "./pages/Messages";
import { SupportChat } from "./pages/SupportChat";
import { Payments } from "./pages/Payments";
import { Transfers } from "./pages/Transfers";

// Renders a different "home" per role at the "/" route, since each role's
// primary landing view is structurally different (spec section 18).
function RoleHome() {
  const { user } = useAuth();
  if (user.role === "Doctor" || user.role === "Specialist") return <DoctorDashboard />;
  if (user.role === "Administrator") return <AdminUsers />;
  return <PatientDashboard />;
}

function RoleGate({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/welcome" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage initialMode="login" />} />
            <Route path="/register" element={<AuthPage initialMode="register" />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<RoleHome />} />

              <Route path="find-doctor" element={<RoleGate roles={["Patient"]}><FindDoctor /></RoleGate>} />
              <Route path="doctors/:id" element={<RoleGate roles={["Patient"]}><DoctorProfileView /></RoleGate>} />
              <Route path="records" element={<RoleGate roles={["Patient"]}><PatientRecords /></RoleGate>} />
              <Route path="profile" element={<RoleGate roles={["Patient"]}><PatientProfile /></RoleGate>} />

              <Route path="patients/:id" element={<RoleGate roles={["Doctor", "Specialist"]}><PatientDetail /></RoleGate>} />
              <Route path="queue" element={<RoleGate roles={["Doctor", "Specialist"]}><DoctorQueue /></RoleGate>} />
              <Route path="availability" element={<RoleGate roles={["Doctor", "Specialist"]}><Availability /></RoleGate>} />
              <Route path="doctor-profile" element={<RoleGate roles={["Doctor", "Specialist"]}><DoctorOwnProfile /></RoleGate>} />

              <Route path="specialties" element={<RoleGate roles={["Administrator"]}><AdminSpecialties /></RoleGate>} />
              <Route path="doctor-applications" element={<RoleGate roles={["Administrator"]}><AdminDoctorApplications /></RoleGate>} />
              <Route path="statistics" element={<RoleGate roles={["Administrator"]}><AdminStatistics /></RoleGate>} />
              <Route path="clinics" element={<RoleGate roles={["Administrator"]}><AdminClinics /></RoleGate>} />
              <Route path="audit" element={<RoleGate roles={["Administrator"]}><AdminAuditLog /></RoleGate>} />
              <Route path="admin-appointments" element={<RoleGate roles={["Administrator"]}><AdminAppointments /></RoleGate>} />
              <Route path="admin-profile" element={<RoleGate roles={["Administrator"]}><AdminProfile /></RoleGate>} />

              <Route path="appointments" element={<RoleGate roles={["Patient", "Doctor", "Specialist"]}><Appointments /></RoleGate>} />
              <Route path="messages" element={<RoleGate roles={["Patient", "Doctor", "Specialist"]}><Messages /></RoleGate>} />
              <Route path="support" element={<RoleGate roles={["Patient"]}><SupportChat /></RoleGate>} />
              <Route path="payments" element={<RoleGate roles={["Patient", "Administrator"]}><Payments /></RoleGate>} />
              <Route path="transfers" element={<RoleGate roles={["Patient", "Doctor", "Specialist", "Administrator"]}><Transfers /></RoleGate>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
