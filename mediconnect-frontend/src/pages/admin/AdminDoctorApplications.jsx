import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, apiDownload } from "../../api/client";
import { Card, Pill, ErrorBanner, EmptyState } from "../../components/ui";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function AdminDoctorApplications() {
  const { t } = useTranslation();
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch("/api/doctor-applications");
      setApplications(data.applications);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function decide(id, status) {
    try { await apiFetch(`/api/doctor-applications/${id}`, { method: "PATCH", body: { status } }); load(); }
    catch (err) { setError(err.message); }
  }

  async function downloadDoc(a) {
    try {
      const blob = await apiDownload(`/api/patients/${a.applicant_patient_id}/documents/${a.document_id}/download`);
      triggerDownload(blob, a.document_file_name || "document");
    } catch (err) { setError(err.message); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  const pending = applications.filter((a) => a.status === "Pending");
  const decided = applications.filter((a) => a.status !== "Pending");

  return (
    <div>
      <h2 className="page-title">{t("admin.doctor_applications")}</h2>
      <ErrorBanner message={error} />

      <Card title={t("admin.pending_review", { count: pending.length })}>
        {pending.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.nothing_pending")}</p>}
        {pending.map((a) => (
          <div key={a.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row-between">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--slate-dim)" }}>{a.email}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn sage small" onClick={() => decide(a.id, "Approved")}>{t("admin.approve")}</button>
                <button className="btn danger small" onClick={() => decide(a.id, "Rejected")}>{t("appointments.reject")}</button>
              </div>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--text)" }}>
              {t("admin.license")}: <span className="mono">{a.license_number}</span>
              {a.specialty_name && <> · {t("admin.specialty")}: {a.specialty_name}</>}
              {a.clinic_name && <> · {t("admin.clinic")}: {a.clinic_name}</>}
            </div>
            {a.bio && <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 4 }}>{a.bio}</div>}
            {a.document_id && (
              <div style={{ marginTop: 6 }}>
                <button className="btn ghost small" onClick={() => downloadDoc(a)}>📎 {t("admin.view_verification_document")}</button>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card title={t("admin.past_decisions")}>
        {decided.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.none_yet")}</p>}
        {decided.map((a) => (
          <div key={a.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span>{a.name} <span className="mono" style={{ fontSize: 11, color: "var(--slate-dim)" }}>{a.email}</span></span>
            <Pill tone={a.status === "Approved" ? "active" : "critical"}>{t(`status.${a.status}`)}</Pill>
          </div>
        ))}
      </Card>
    </div>
  );
}
