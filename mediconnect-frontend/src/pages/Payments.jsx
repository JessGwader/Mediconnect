import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, apiDownload } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card, Pill, EmptyState, ErrorBanner } from "../components/ui";
import { formatXAF } from "../utils/currency";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function Payments() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch("/api/payments");
      setPayments(data.payments);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function refreshStatus(ref) {
    try {
      await apiFetch(`/api/payments/${ref}/status`);
      load();
    } catch (err) { setError(err.message); }
  }

  async function downloadReceipt(payment) {
    try {
      const blob = await apiDownload(`/api/payments/${payment.id}/receipt`);
      triggerDownload(blob, `receipt-${payment.transaction_ref}.pdf`);
    } catch (err) { setError(err.message); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("payments.title")}</h2>
      <ErrorBanner message={error} />
      <Card title={user.role === "Administrator" ? t("payments.all_payments_title") : t("payments.history_title")}>
        {payments.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("payments.none_yet")}</p>}
        {payments.map((p) => (
          <div key={p.id} className="row-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                {formatXAF(p.amount)} {user.role === "Administrator" && p.patient_name ? `— ${p.patient_name}` : ""}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--slate-dim)" }}>{p.transaction_ref} · {p.provider}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Pill tone={p.status === "Successful" ? "active" : p.status === "Failed" ? "critical" : "warning"}>{t(`status.${p.status}`)}</Pill>
              {p.status === "Pending" && <button className="btn ghost small" onClick={() => refreshStatus(p.transaction_ref)}>{t("payments.check_status")}</button>}
              {p.status === "Successful" && <button className="btn ghost small" onClick={() => downloadReceipt(p)}>📄 {t("payments.receipt")}</button>}
            </div>
          </div>
        ))}
      </Card>
      <p className="hint">{t("payments.verification_note")}</p>
    </div>
  );
}
