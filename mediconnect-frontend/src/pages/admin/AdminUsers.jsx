import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, Pill, ErrorBanner, EmptyState, Modal, Field } from "../../components/ui";

const SUSPEND_PRESETS = [
  { key: "1h", hours: 1 },
  { key: "24h", hours: 24 },
  { key: "7d", hours: 24 * 7 },
  { key: "30d", hours: 24 * 30 },
];

export function AdminUsers() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suspendTarget, setSuspendTarget] = useState(null); // { id, name } | null
  const [customUntil, setCustomUntil] = useState("");
  const [suspendBusy, setSuspendBusy] = useState(false);

  async function load() {
    try {
      const data = await apiFetch("/api/admin/users");
      setUsers(data.users);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function changeStatus(id, status, until) {
    try {
      await apiFetch(`/api/admin/users/${id}/status`, { method: "PATCH", body: until ? { status, until } : { status } });
      load();
    } catch (err) { setError(err.message); }
  }

  async function confirmSuspend(until) {
    if (!suspendTarget) return;
    setSuspendBusy(true);
    try {
      await changeStatus(suspendTarget.id, "Suspended", until);
      setSuspendTarget(null);
      setCustomUntil("");
    } finally { setSuspendBusy(false); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("admin.user_management")}</h2>
      <ErrorBanner message={error} />
      <Card>
        <div className="table-wrap">
        <table>
          <thead><tr><th>{t("common.name")}</th><th>{t("admin.role")}</th><th>{t("common.status")}</th><th>{t("common.actions")}</th></tr></thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: "14px 8px", color: "var(--slate)" }}>{t("admin.no_users_found")}</td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}<div className="mono" style={{ fontSize: 11, color: "var(--slate-dim)" }}>{u.email}</div></td>
                <td><Pill tone="warning">{t(`roles.${u.role}`, u.role)}</Pill></td>
                <td>
                  <Pill tone={u.status === "Active" ? "active" : u.status === "Suspended" ? "critical" : "warning"}>{t(`status.${u.status}`, u.status)}</Pill>
                  {u.status === "Suspended" && u.suspended_until && (
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--slate-dim)", marginTop: 3 }}>
                      {t("admin.until")} {new Date(u.suspended_until).toLocaleString()}
                    </div>
                  )}
                </td>
                <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn ghost small" onClick={() => changeStatus(u.id, "Active")}>{t("admin.activate")}</button>
                  <button className="btn ghost small" onClick={() => setSuspendTarget({ id: u.id, name: u.name })}>{t("admin.suspend")}</button>
                  <button className="btn danger small" onClick={() => changeStatus(u.id, "Disabled")}>{t("admin.disable")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      <p className="hint">🔒 {t("admin.self_role_note")}</p>

      {suspendTarget && (
        <Modal title={t("admin.suspend_modal_title", { name: suspendTarget.name })} onClose={() => setSuspendTarget(null)}>
          <p style={{ fontSize: 13, color: "var(--slate)", marginBottom: 14 }}>{t("admin.suspend_modal_hint")}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {SUSPEND_PRESETS.map((p) => (
              <button
                key={p.key}
                className="btn ghost small"
                disabled={suspendBusy}
                onClick={() => confirmSuspend(new Date(Date.now() + p.hours * 60 * 60 * 1000).toISOString())}
              >
                {t(`admin.suspend_preset_${p.key}`)}
              </button>
            ))}
          </div>
          <Field label={t("admin.suspend_custom_until")}>
            <input type="datetime-local" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="btn danger small"
              disabled={suspendBusy || !customUntil}
              onClick={() => confirmSuspend(new Date(customUntil).toISOString())}
            >
              {suspendBusy ? "…" : t("admin.suspend_confirm")}
            </button>
            <button className="btn ghost small" onClick={() => setSuspendTarget(null)}>{t("common.cancel")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
