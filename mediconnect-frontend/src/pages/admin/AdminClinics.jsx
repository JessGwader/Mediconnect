import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, Field, ErrorBanner, EmptyState } from "../../components/ui";

export function AdminClinics() {
  const { t } = useTranslation();
  const [clinics, setClinics] = useState([]);
  const [form, setForm] = useState({ name: "", address: "", city: "", phone: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await apiFetch("/api/clinics");
      setClinics(data.clinics);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.name || !form.address) { setError(t("admin.name_address_required")); return; }
    setSaving(true);
    try {
      await apiFetch("/api/clinics", { method: "POST", body: form });
      setForm({ name: "", address: "", city: "", phone: "" });
      load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("admin.clinics_title")}</h2>
      <ErrorBanner message={error} />
      <Card title={t("admin.all_clinics")}>
        {clinics.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_clinics_yet")}</p>}
        {clinics.map((c) => (
          <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
            <strong>{c.name}</strong> — {c.address}{c.city ? `, ${c.city}` : ""}{c.phone ? ` · ${c.phone}` : ""}
          </div>
        ))}
      </Card>
      <Card title={t("admin.add_clinic")}>
        <Field label={t("common.name")}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t("admin.address")}><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label={t("admin.city")}><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          <Field label={t("admin.phone")}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <button className="btn" onClick={add} disabled={saving}>{saving ? t("common.saving") : `+ ${t("admin.add_clinic")}`}</button>
      </Card>
    </div>
  );
}
