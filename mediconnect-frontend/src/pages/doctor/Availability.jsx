import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card, Field, ErrorBanner, EmptyState } from "../../components/ui";

export function Availability() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const DAYS = t("doctor.days", { returnObjects: true });
  const [windows, setWindows] = useState([]);
  const [form, setForm] = useState({ dayOfWeek: "1", startTime: "09:00", endTime: "12:00", slotMinutes: "30" });
  const [dailyLimit, setDailyLimit] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingLimit, setSavingLimit] = useState(false);

  async function load() {
    try {
      const [avail, cap] = await Promise.all([
        apiFetch(`/api/doctors/${user.id}/availability`),
        apiFetch("/api/doctors/me/capacity"),
      ]);
      setWindows(avail.availability);
      setDailyLimit(cap.dailyPatientLimit != null ? String(cap.dailyPatientLimit) : "");
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addWindow() {
    try {
      await apiFetch("/api/doctors/me/availability", {
        method: "POST",
        body: { dayOfWeek: Number(form.dayOfWeek), startTime: form.startTime, endTime: form.endTime, slotMinutes: Number(form.slotMinutes) },
      });
      load();
    } catch (err) { setError(err.message); }
  }

  async function removeWindow(id) {
    try {
      await apiFetch(`/api/doctors/me/availability/${id}`, { method: "DELETE" });
      load();
    } catch (err) { setError(err.message); }
  }

  async function saveLimit() {
    setSavingLimit(true);
    try {
      const value = dailyLimit.trim() === "" ? null : Number(dailyLimit);
      await apiFetch("/api/doctors/me/capacity", { method: "PATCH", body: { dailyLimit: value } });
      load();
    } catch (err) { setError(err.message); } finally { setSavingLimit(false); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("doctor.availability_title")}</h2>
      <ErrorBanner message={error} />

      <Card title={t("doctor.daily_limit_title")}>
        <p style={{ fontSize: 13, color: "var(--slate)", marginTop: 0 }}>
          {t("doctor.daily_limit_note")}
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <Field label={t("doctor.max_patients_per_day")}>
            <input type="number" min="1" placeholder={t("doctor.no_limit_placeholder")} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} style={{ width: 160 }} />
          </Field>
          <button className="btn" onClick={saveLimit} disabled={savingLimit} style={{ marginBottom: 13 }}>{savingLimit ? t("common.saving") : t("common.save")}</button>
        </div>
      </Card>

      <Card title={t("doctor.recurring_windows")}>
        {windows.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("doctor.no_availability_set")}</p>}
        {windows.map((w) => (
          <div key={w.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
            <span>{DAYS[w.day_of_week]} · {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)} <span className="mono" style={{ fontSize: 11.5, color: "var(--slate-dim)" }}>({w.slot_minutes}-min slots)</span></span>
            <button className="btn ghost small" onClick={() => removeWindow(w.id)}>{t("common.remove")}</button>
          </div>
        ))}
      </Card>

      <Card title={t("doctor.add_availability_window")}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label={t("doctor.day")}>
            <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </Field>
          <Field label={t("doctor.start")}><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
          <Field label={t("doctor.end")}><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
          <Field label={t("doctor.slot_length")}>
            <select value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })}>
              <option value="15">15</option><option value="20">20</option><option value="30">30</option><option value="45">45</option><option value="60">60</option>
            </select>
          </Field>
          <button className="btn" onClick={addWindow} style={{ marginBottom: 13 }}>+ {t("common.add")}</button>
        </div>
      </Card>
    </div>
  );
}
