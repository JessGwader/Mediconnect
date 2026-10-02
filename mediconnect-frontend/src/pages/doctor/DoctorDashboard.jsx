import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card, Pill, EmptyState, ErrorBanner } from "../../components/ui";

const STAT_ICON = { blue: "📅", sage: "✅", warning: "⏳", neutral: "🧑‍🤝‍🧑", critical: "✉️" };

function StatBox({ label, value, tone }) {
  return (
    <div className={`stat-box stat-${tone || "neutral"}`} style={{
      flex: 1, minWidth: 130, padding: "16px 14px", borderRadius: "var(--radius)",
      border: "1px solid var(--line)", background: "var(--card)", boxShadow: "var(--shadow-sm)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 17, background: "var(--brand-grad-soft)", flexShrink: 0,
      }}>{STAT_ICON[tone] || "📊"}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: "var(--ink)" }}>{value}</div>
        <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export function DoctorDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [completingId, setCompletingId] = useState(null);

  async function reload() {
    try {
      const d = await apiFetch("/api/doctors/me/dashboard");
      setData(d);
    } catch (err) { setError(err.message); }
  }

  useEffect(() => {
    (async () => { await reload(); setLoading(false); })();
  }, []);

  async function markCompleted(appointmentId) {
    setCompletingId(appointmentId);
    try {
      await apiFetch(`/api/appointments/${appointmentId}`, { method: "PATCH", body: { status: "Completed" } });
      await reload();
    } catch (err) { setError(err.message); } finally { setCompletingId(null); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;
  if (!data) return <ErrorBanner message={error} />;

  const { todayAppointments, counts, recentConsultations } = data;

  return (
    <div>
      <h2 className="page-title">{t("dashboard.welcome_back_name", { name: user.name.split(" ")[0] })}</h2>
      <ErrorBanner message={error} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label={t("dashboard.today_appointments")} value={counts.todayTotal} tone="blue" />
        <StatBox label={t("dashboard.today_completed")} value={counts.todayCompleted} tone="sage" />
        <StatBox label={t("dashboard.pending_requests")} value={counts.pendingRequests} tone="warning" />
        <StatBox label={t("dashboard.total_patients")} value={counts.totalPatients} tone="neutral" />
        <StatBox label={t("dashboard.unread_messages")} value={counts.unreadMessages} tone="critical" />
      </div>

      <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div>
          <Card title={t("dashboard.todays_schedule")} action={<Link to="/queue" className="btn ghost small">{t("dashboard.view_all")}</Link>}>
            {todayAppointments.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("dashboard.no_appointments_today")}</p>}
            {todayAppointments.map((a) => (
              <div key={a.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <Link to={`/patients/${a.patient_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.patient_name}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--slate-dim)" }}>{String(a.scheduled_time).slice(0, 5)}</div>
                </Link>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill tone={a.status === "Confirmed" ? "active" : a.status === "Completed" ? "neutral" : "warning"}>{t(`status.${a.status}`)}</Pill>
                  {a.status === "Confirmed" && (
                    <button className="btn small sage" disabled={completingId === a.id} onClick={() => markCompleted(a.id)}>
                      {completingId === a.id ? "…" : `✅ ${t("dashboard.mark_completed", "Mark completed")}`}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card title={t("dashboard.recent_consultations")}>
            {recentConsultations.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("dashboard.no_recent_consultations")}</p>}
            {recentConsultations.map((c) => (
              <Link key={c.id} to={`/patients/${c.patient_id}`} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "inherit" }}>
                <div style={{ fontSize: 13.5 }}>{c.patient_name}</div>
                <div style={{ fontSize: 12, color: "var(--slate-dim)" }}>{c.diagnosis || t("dashboard.no_diagnosis_yet")}</div>
              </Link>
            ))}
          </Card>
        </div>

        <div>
          <Card title={t("dashboard.quick_links")}>
            <Link to="/queue" className="btn" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}>{t("dashboard.patient_queue")}</Link>
            <Link to="/messages" className="btn ghost" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}>{t("dashboard.messages")}</Link>
            <Link to="/availability" className="btn ghost" style={{ width: "100%", justifyContent: "center" }}>{t("dashboard.manage_availability")}</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
