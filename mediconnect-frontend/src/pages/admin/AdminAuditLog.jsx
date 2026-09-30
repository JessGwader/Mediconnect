import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, ErrorBanner, EmptyState } from "../../components/ui";

export function AdminAuditLog() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/admin/audit-log")
      .then((data) => setEntries(data.entries))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("admin.audit_log")}</h2>
      <ErrorBanner message={error} />
      <Card>
        {entries.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_entries_yet")}</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span><strong>{entry.actor_name}</strong> — {entry.action}</span>
            <span className="mono" style={{ color: "var(--slate-dim)", fontSize: 11.5 }}>{String(entry.created_at).replace("T", " ").slice(0, 19)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
