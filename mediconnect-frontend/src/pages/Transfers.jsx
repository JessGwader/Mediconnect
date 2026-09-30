import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, apiDownload } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card, Pill, EmptyState, ErrorBanner } from "../components/ui";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function Transfers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch("/api/transfers");
      setTransfers(data.transfers);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) {
    try { await apiFetch(`/api/transfers/${id}`, { method: "PATCH", body: { status } }); load(); }
    catch (err) { setError(err.message); }
  }

  async function downloadReferralLetter(id) {
    try {
      const blob = await apiDownload(`/api/transfers/${id}/referral-letter`);
      triggerDownload(blob, `referral-letter-${id}.pdf`);
    } catch (err) { setError(err.message); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("transfers.title")}</h2>
      <ErrorBanner message={error} />
      {transfers.length === 0 && <Card><p style={{ fontSize: 13, margin: 0, color: "var(--slate)" }}>{t("transfers.none_found")}</p></Card>}
      {transfers.map((tr) => {
        const isDestination = (user.role === "Doctor" || user.role === "Specialist") && tr.to_doctor_id === user.id;
        return (
          <Card key={tr.id}>
            <div className="row-between">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{tr.patient_name}</div>
                <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 2 }}>
                  {tr.from_doctor_name || "—"} → {tr.to_doctor_name || tr.to_clinic_name || "—"}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>{tr.reason}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Pill tone={tr.status === "Completed" || tr.status === "Accepted" ? "active" : tr.status === "Rejected" || tr.status === "Cancelled" ? "critical" : "warning"}>{t(`status.${tr.status}`)}</Pill>
                <button className="btn ghost small" onClick={() => downloadReferralLetter(tr.id)}>📄 {t("transfers.referral_letter")}</button>
                {isDestination && tr.status === "Requested" && (
                  <>
                    <button className="btn ghost small" onClick={() => setStatus(tr.id, "Accepted")}>{t("transfers.accept")}</button>
                    <button className="btn ghost small" onClick={() => setStatus(tr.id, "Rejected")}>{t("transfers.reject")}</button>
                  </>
                )}
                {isDestination && tr.status === "Accepted" && (
                  <button className="btn sage small" onClick={() => setStatus(tr.id, "Completed")}>{t("transfers.mark_completed")}</button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
