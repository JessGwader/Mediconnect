import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, ErrorBanner, EmptyState } from "../../components/ui";

export function AdminSpecialties() {
  const { t } = useTranslation();
  const [specialties, setSpecialties] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch("/api/specialties");
      setSpecialties(data.specialties);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    try {
      await apiFetch("/api/specialties", { method: "POST", body: { name: name.trim(), description: description.trim() || undefined } });
      setName(""); setDescription(""); load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    try { await apiFetch(`/api/specialties/${id}`, { method: "DELETE" }); load(); }
    catch (err) { setError(err.message); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("admin.specialties_title")}</h2>
      <ErrorBanner message={error} />
      <Card title={t("admin.existing_specialties")}>
        {specialties.map((s) => (
          <div key={s.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
            <span>{s.name}{s.description ? <span style={{ color: "var(--slate-dim)" }}> — {s.description}</span> : ""}</span>
            <button className="btn danger small" onClick={() => remove(s.id)}>{t("common.delete")}</button>
          </div>
        ))}
      </Card>
      <Card title={t("admin.add_specialty")}>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder={t("admin.description_optional")} value={description} onChange={(e) => setDescription(e.target.value)} />
          <button className="btn" onClick={add}>+ {t("common.add")}</button>
        </div>
      </Card>
    </div>
  );
}
