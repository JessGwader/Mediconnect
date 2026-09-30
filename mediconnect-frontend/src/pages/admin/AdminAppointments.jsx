import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, Pill, ErrorBanner, EmptyState } from "../../components/ui";

export function AdminAppointments() {
  const { t } = useTranslation();
  const [appointments, setAppointments] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/appointments")
      .then((data) => setAppointments(data.appointments))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  const filtered = statusFilter ? appointments.filter((a) => a.status === statusFilter) : appointments;
  const statuses = ["Pending", "Confirmed", "Rejected", "Rescheduled", "Completed", "Cancelled"];

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <h2 className="page-title" style={{ margin: 0 }}>{t("admin.appointments_title")}</h2>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">{t("admin.all_statuses")}</option>
          {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
      </div>
      <ErrorBanner message={error} />
      <Card>
        {filtered.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_appointments_found")}</p> : (
          <div className="table-wrap">
          <table>
            <thead><tr><th>{t("appointments.patient")}</th><th>{t("appointments.doctor")}</th><th>{t("common.date")}</th><th>{t("common.time")}</th><th>{t("common.status")}</th></tr></thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>{a.patient_name}</td>
                  <td>{a.doctor_name}</td>
                  <td>{String(a.scheduled_date).slice(0, 10)}</td>
                  <td>{String(a.scheduled_time).slice(0, 5)}</td>
                  <td><Pill tone={a.status === "Confirmed" || a.status === "Completed" ? "active" : (a.status === "Cancelled" || a.status === "Rejected") ? "critical" : "warning"}>{t(`status.${a.status}`)}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
