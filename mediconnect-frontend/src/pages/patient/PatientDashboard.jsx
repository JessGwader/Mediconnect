import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, Pill, EmptyState, ErrorBanner } from "../../components/ui";

export function PatientDashboard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [application, setApplication] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const patient = await apiFetch("/api/patients/me");
        const [appts, convos, docs, pays, app] = await Promise.all([
          apiFetch("/api/appointments"),
          apiFetch("/api/conversations"),
          apiFetch(`/api/patients/${patient.patient.id}/documents`),
          apiFetch("/api/payments"),
          apiFetch("/api/doctor-applications/me").catch(() => ({ application: null })),
        ]);
        setAppointments(appts.appointments);
        setConversations(convos.conversations);
        setDocuments(docs.documents);
        setPayments(pays.payments);
        setApplication(app.application);
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    })();
  }, []);

  const upcoming = appointments.filter((a) => ["Pending", "Confirmed", "Rescheduled"].includes(a.status));

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("dashboard.title")}</h2>
      <ErrorBanner message={error} />

      {application?.status === "Pending" && (
        <div className="auth-note" style={{ marginBottom: 16 }}>
          🩺 {t("dashboard.doctor_app_pending")}
        </div>
      )}
      {application?.status === "Rejected" && (
        <div style={{ background: "var(--amber-soft)", color: "var(--amber)", fontSize: 12.5, padding: "10px 12px", borderRadius: 8, marginBottom: 16 }}>
          ⚠ {t("dashboard.doctor_app_rejected")}
        </div>
      )}

      <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div>
          <Card title={t("dashboard.upcoming_appointments")} action={<Link to="/appointments" className="btn ghost small">{t("dashboard.view_all")}</Link>}>
            {upcoming.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("appointments.no_upcoming")}</p>}
            {upcoming.slice(0, 4).map((a) => (
              <div key={a.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.doctor_name}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--slate-dim)" }}>
                    {String(a.scheduled_date).slice(0, 10)} · {String(a.scheduled_time).slice(0, 5)}
                  </div>
                </div>
                <Pill tone={a.status === "Confirmed" ? "active" : "warning"}>{t(`status.${a.status}`)}</Pill>
              </div>
            ))}
          </Card>

          <Card title={t("dashboard.recent_messages")} action={<Link to="/messages" className="btn ghost small">{t("dashboard.open")}</Link>}>
            {conversations.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("dashboard.no_conversations")}</p>}
            {conversations.slice(0, 4).map((c) => (
              <div key={c.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 13.5 }}>{c.doctor_name}</div>
                <div style={{ fontSize: 12, color: "var(--slate-dim)" }}>{c.last_message || t("dashboard.no_message_preview")}</div>
              </div>
            ))}
          </Card>
        </div>

        <div>
          <Card title={t("dashboard.quick_search")}>
            <Link to="/find-doctor" className="btn" style={{ width: "100%", justifyContent: "center" }}>{t("dashboard.find_a_doctor")}</Link>
          </Card>
          <Card title={t("dashboard.documents")} action={<Link to="/records" className="btn ghost small">{t("dashboard.all_records")}</Link>}>
            {documents.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("dashboard.no_documents")}</p>}
            {documents.slice(0, 4).map((d) => <div key={d.id} style={{ fontSize: 13, padding: "6px 0" }}>{d.file_name}</div>)}
          </Card>
          <Card title={t("dashboard.payments")} action={<Link to="/payments" className="btn ghost small">{t("dashboard.history")}</Link>}>
            {payments.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("dashboard.no_payments")}</p>}
            {payments.slice(0, 3).map((p) => (
              <div key={p.id} className="row-between" style={{ padding: "6px 0", fontSize: 13 }}>
                <span>{p.amount} {p.currency}</span>
                <Pill tone={p.status === "Successful" ? "active" : p.status === "Failed" ? "critical" : "warning"}>{t(`status.${p.status}`)}</Pill>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
