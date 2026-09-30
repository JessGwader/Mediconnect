import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, Field, ErrorBanner, EmptyState } from "../../components/ui";
import { TwoFactorSettings } from "../../components/TwoFactorSettings";
import { AvatarUpload } from "../../components/AvatarUpload";
import { useAuth } from "../../context/AuthContext";

export function DoctorProfile() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [clinics, setClinics] = useState([]);
  const [form, setForm] = useState({ name: "", bio: "", clinicId: "" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(null);

  const [additionalSpecialties, setAdditionalSpecialties] = useState([]);
  const [allSpecialties, setAllSpecialties] = useState([]);
  const [addingSpecialty, setAddingSpecialty] = useState(false);
  const [specialtyForm, setSpecialtyForm] = useState({ specialtyId: "", licenseNumber: "" });
  const [specialtyError, setSpecialtyError] = useState(null);
  const [specialtyBusy, setSpecialtyBusy] = useState(false);

  async function reloadProfile() {
    const p = await apiFetch("/api/doctors/me/profile");
    setProfile(p.profile);
    setAdditionalSpecialties(p.additionalSpecialties || []);
    setForm({ name: p.profile.name || "", bio: p.profile.bio || "", clinicId: p.profile.clinic_id || "" });
  }

  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([apiFetch("/api/clinics"), apiFetch("/api/specialties")]);
        await reloadProfile();
        setClinics(c.clinics);
        setAllSpecialties(s.specialties);
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    })();
  }, []);

  async function addSpecialty(e) {
    e.preventDefault();
    setSpecialtyError(null); setSpecialtyBusy(true);
    try {
      await apiFetch("/api/doctors/me/specialties", {
        method: "POST",
        body: { specialtyId: specialtyForm.specialtyId, licenseNumber: specialtyForm.licenseNumber.trim() },
      });
      setSpecialtyForm({ specialtyId: "", licenseNumber: "" });
      setAddingSpecialty(false);
      await reloadProfile();
    } catch (err) { setSpecialtyError(err.message); } finally { setSpecialtyBusy(false); }
  }

  async function removeSpecialty(id) {
    try {
      await apiFetch(`/api/doctors/me/specialties/${id}`, { method: "DELETE" });
      await reloadProfile();
    } catch (err) { setError(err.message); }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    try {
      await apiFetch("/api/doctors/me/profile", {
        method: "PATCH",
        body: { name: form.name, bio: form.bio, clinicId: form.clinicId || null },
      });
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

      <Card title={t("profile.professional_details")}>
        {success && <div className="auth-note" style={{ marginBottom: 14 }}>{success}</div>}
        <form onSubmit={saveProfile}>
          <Field label={t("auth.full_name")}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label={t("auth.email")}><input value={profile?.email || ""} disabled /></Field>
            <Field label={t("auth.specialty")}><input value={profile?.specialty_name || t("profile.general_medicine_default")} disabled /></Field>
          </div>
          <Field label={t("auth.clinic")}>
            <select value={form.clinicId} onChange={(e) => setForm({ ...form, clinicId: e.target.value })}>
              <option value="">{t("profile.none_option")}</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t("auth.professional_bio")}>
            <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </Field>
          <button className="btn" type="submit" disabled={saving}>{saving ? t("common.saving") : t("common.save_changes")}</button>
        </form>
        <p className="hint" style={{ marginTop: 10 }}>{t("profile.specialty_locked_note")}</p>
      </Card>

      {user.role === "Specialist" && (
        <Card title={t("profile.additional_specialties")}>
          {specialtyError && <div className="auth-error" style={{ marginBottom: 10 }}>{specialtyError}</div>}
          {additionalSpecialties.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("profile.no_additional_specialties")}</p>}
          {additionalSpecialties.map((s) => (
            <div key={s.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
              <span>{s.specialty_name} <span className="mono" style={{ color: "var(--slate-dim)", fontSize: 11.5 }}>· {s.license_number}</span></span>
              <button className="btn ghost small" onClick={() => removeSpecialty(s.id)}>{t("common.remove")}</button>
            </div>
          ))}
          {addingSpecialty ? (
            <form onSubmit={addSpecialty} style={{ marginTop: 12 }}>
              <Field label={t("auth.specialty")}>
                <select required value={specialtyForm.specialtyId} onChange={(e) => setSpecialtyForm({ ...specialtyForm, specialtyId: e.target.value })}>
                  <option value="">{t("auth.select_ellipsis")}</option>
                  {allSpecialties.filter((s) => s.id !== profile?.specialty_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label={t("auth.license_number")}>
                <input required value={specialtyForm.licenseNumber} onChange={(e) => setSpecialtyForm({ ...specialtyForm, licenseNumber: e.target.value })} />
              </Field>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn small" type="submit" disabled={specialtyBusy}>{specialtyBusy ? "…" : t("common.add")}</button>
                <button className="btn ghost small" type="button" onClick={() => setAddingSpecialty(false)}>{t("common.cancel")}</button>
              </div>
            </form>
          ) : additionalSpecialties.length === 0 && (
            <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setAddingSpecialty(true)}>+ {t("profile.add_specialty")}</button>
          )}
        </Card>
      )}

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
