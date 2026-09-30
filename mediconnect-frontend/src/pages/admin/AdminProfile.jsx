import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card, Field, ErrorBanner, EmptyState } from "../../components/ui";
import { TwoFactorSettings } from "../../components/TwoFactorSettings";
import { AvatarUpload } from "../../components/AvatarUpload";

export function AdminProfile() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", phone: "" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(null);

  useEffect(() => {
    apiFetch("/api/admin/me/profile")
      .then((data) => setForm({ name: data.profile.name || "", phone: data.profile.phone || "" }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    try {
      await apiFetch("/api/admin/me/profile", { method: "PATCH", body: { name: form.name, phone: form.phone } });
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
          <div className="auth-2col">
            <Field label={t("auth.full_name")}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("auth.email")}><input value={user.email || ""} disabled /></Field>
          </div>
          <Field label={t("auth.phone")} hint={t("auth.phone_hint")}>
            <input type="tel" placeholder="6XX XXX XXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <button className="btn" type="submit" disabled={saving}>{saving ? t("common.saving") : t("common.save_changes")}</button>
        </form>
      </Card>

      <Card title={t("profile.change_password")}>
        {pwError && <div className="auth-error">{pwError}</div>}
        {pwSuccess && <div className="auth-note">{pwSuccess}</div>}
        <form onSubmit={changePassword}>
          <Field label={t("profile.current_password")}>
            <input type="password" required value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
          </Field>
          <div className="auth-2col">
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
