import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationBell } from "./NotificationBell";
import logo from "../assets/logo-mark.png";

function navItemsFor(role, t) {
  if (role === "Doctor" || role === "Specialist") {
    return [
      ["/", t("nav.dashboard"), "🏠"],
      ["/queue", t("nav.patient_queue"), "👥"],
      ["/appointments", t("nav.appointments"), "📅"],
      ["/messages", t("nav.messages"), "💬"],
      ["/transfers", t("nav.transfers"), "⇄"],
      ["/availability", t("nav.availability"), "🗓️"],
      ["/doctor-profile", t("nav.profile"), "👤"],
    ];
  }
  if (role === "Administrator") {
    return [
      ["/", t("nav.users"), "🛠️"],
      ["/doctor-applications", t("nav.doctor_applications"), "🩺"],
      ["/admin-appointments", t("nav.appointments"), "📅"],
      ["/statistics", t("nav.statistics"), "✨"],
      ["/specialties", t("nav.specialties"), "🏷️"],
      ["/clinics", t("nav.clinics"), "📍"],
      ["/transfers", t("nav.transfers"), "⇄"],
      ["/payments", t("nav.payments"), "💳"],
      ["/audit", t("nav.audit_log"), "🛡️"],
      ["/admin-profile", t("nav.profile"), "👤"],
    ];
  }
  // Patient
  return [
    ["/", t("nav.dashboard"), "🏠"],
    ["/find-doctor", t("nav.find_doctor"), "🔍"],
    ["/appointments", t("nav.appointments"), "📅"],
    ["/records", t("nav.records"), "📄"],
    ["/messages", t("nav.messages"), "💬"],
    ["/support", t("nav.support"), "❤️"],
    ["/payments", t("nav.payments"), "💳"],
    ["/transfers", t("nav.transfers"), "⇄"],
    ["/profile", t("nav.profile"), "👤"],
  ];
}

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const nav = navItemsFor(user.role, t);
  const roleIcon = user.role === "Doctor" || user.role === "Specialist" ? "🩺" : user.role === "Administrator" ? "🛠️" : "👤";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><img src={logo} alt="" /><span className="display" style={{ fontSize: 18 }}>{t("app_name")}</span></div>
        {nav.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}>
            {icon} {label}
          </NavLink>
        ))}
        <div className="side-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 10 }}>
            <span>{roleIcon}</span>
            <div><div style={{ fontWeight: 700 }}>{user.name}</div><div style={{ opacity: 0.7, fontSize: 11 }}>{user.role}</div></div>
          </div>
          <button onClick={logout} className="nav-btn" style={{ opacity: 0.85 }}>↩ {t("common.sign_out")}</button>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <button className="icon-btn" onClick={toggleTheme} title={t("theme.toggle")}>
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          <LanguageSwitcher />
          <NotificationBell />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
