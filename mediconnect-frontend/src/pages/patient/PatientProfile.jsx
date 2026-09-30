import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card, Field, ErrorBanner, EmptyState } from "../../components/ui";
import { TwoFactorSettings } from "../../components/TwoFactorSettings";
import { AvatarUpload } from "../../components/AvatarUpload";

export function PatientProfile() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({ name: "", dob: "", allergiesText: "" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(null);

  useEffect(() => {
    apiFetch("/api/patients/me")
      .then((data) => {
        setPatient(data.patient);
        setForm({
          name: data.patient.name || "",
          dob: data.patient.dob ? String(data.patient.dob).slice(0, 10) : "",
          allergiesText: (data.patient.allergies || []).join(", "),
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    try {
      const allergies = form.allergiesText.split(",").map((s) => s.trim()).filter(Boolean);
      const data = await apiFetch("/api/patients/me", {
        method: "PATCH",
        body: { name: form.name, dob: form.dob, allergies },
      });
      setPatient(data.patient);
      setSuccess(t("profile.profile_updated"));
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwError(null); setPwSuccess(null);
    if (pwForm.next !== pwForm.confirm) { setPwError(t("auth.passwords_no_match")); return; }
    setPwBusy(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: pwForm.current, newPassword: pwForm.next },
      });
      setPwSuccess(t("profile.password_changed"));
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) { setPwError(err.message); } finally { setPwBusy(false); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("profile.title")}</h2>
      <ErrorBanner message={error} />

      <Card title={t("profile.personal_details")}>
        {success && <div className="auth-note" style={{ marginBottom: 14 }}>{success}</div>}
        <form onSubmit={saveProfile}>
          <Field label={t("auth.full_name")}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label={t("auth.dob")}>
              <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </Field>
            <Field label={t("auth.email")}><input value={user.email || ""} disabled /></Field>
          </div>
          <Field label={t("profile.allergies_comma")}>
            <input value={form.allergiesText} onChange={(e) => setForm({ ...form, allergiesText: e.target.value })} />
          </Field>
          <button className="btn" type="submit" disabled={saving}>{saving ? t("common.saving") : t("common.save_changes")}</button>
        </form>
        {patient && <p className="hint" style={{ marginTop: 10 }}>{t("profile.mrn")}: {patient.mrn}</p>}
      </Card>

      <Card title={t("profile.change_password")}>
        {pwError && <div className="auth-error">{pwError}</div>}
        {pwSuccess && <div className="auth-note">{pwSuccess}</div>}
        <form onSubmit={changePassword}>
          <Field label={t("profile.current_password")}>
            <input type="password" required value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label={t("profile.new_password")} hint={t("auth.password_hint")}>
              <input type="password" required value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
            </Field>
            <Field label={t("profile.confirm_new_password")}>
              <input type="password" required value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
            </Field>
          </div>
          <button className="btn ghost" type="submit" disabled={pwBusy}>{pwBusy ? "…" : t("profile.change_password")}</button>
        </form>
      </Card>

      <AvatarUpload />
      <TwoFactorSettings />
    </div>
  );
}
