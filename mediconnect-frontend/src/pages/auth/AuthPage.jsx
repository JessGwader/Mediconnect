import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../api/client";
import { Field } from "../../components/ui";
import logo from "../../assets/logo-mark.png";
import "./auth.css";

export function AuthPage({ initialMode }) {
  const { t } = useTranslation();
  const { login, register, verifyTwoFactor, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  // Form intent only, never a real role grant (see role_note) — a `?intent=Doctor`
  // link (e.g. from the landing page's "Apply as a doctor" CTA) just preselects
  // this tab; the account is still created as Patient server-side either way.
  const [intent, setIntent] = useState(searchParams.get("intent") === "Doctor" ? "Doctor" : "Patient");
  const [step, setStep] = useState(1); // step 2 = professional details (Doctor intent), step 3 = submitted confirmation
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState(null); // set once /login says requires2FA
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "", rememberMe: false });
  const [regForm, setRegForm] = useState({ name: "", email: "", dob: "", gender: "", phone: "", password: "", password2: "" });
  const [proForm, setProForm] = useState({ doctorType: "Generalist", licenseNumber: "", specialtyId: "", clinicId: "", bio: "", document: null });
  const [specialties, setSpecialties] = useState([]);
  const [clinics, setClinics] = useState([]);

  async function submitLogin(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const result = await login(loginForm.email, loginForm.password, loginForm.rememberMe);
      if (result?.requires2FA) {
        setTwoFactorToken(result.twoFactorToken);
      } else {
        navigate("/");
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function submitTwoFactor(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await verifyTwoFactor(twoFactorToken, twoFactorCode.trim(), loginForm.rememberMe);
      navigate("/");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function submitAccountStep(e) {
    e.preventDefault();
    if (regForm.password !== regForm.password2) { setError(t("auth.passwords_no_match")); return; }
    if (!regForm.dob) { setError(t("auth.dob_required")); return; }
    if (!regForm.gender) { setError(t("auth.gender_required")); return; }
    setError(null); setBusy(true);
    try {
      await register({ name: regForm.name, email: regForm.email, password: regForm.password, dob: regForm.dob, gender: regForm.gender, phone: regForm.phone });
      if (intent === "Doctor") {
        const [s, c] = await Promise.all([apiFetch("/api/specialties"), apiFetch("/api/clinics")]);
        setSpecialties(s.specialties); setClinics(c.clinics);
        setStep(2);
      } else {
        navigate("/");
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function submitProfessionalStep(e) {
    e.preventDefault();
    if (!proForm.licenseNumber.trim()) { setError(t("auth.license_required")); return; }
    if (proForm.doctorType === "Specialist" && !proForm.specialtyId) { setError(t("auth.specialty_required")); return; }
    if (regForm.dob) {
      const age = Math.floor((Date.now() - new Date(regForm.dob).getTime()) / (365.2425 * 24 * 60 * 60 * 1000));
      if (age < 21) { setError(t("auth.doctor_age_requirement")); return; }
    }
    setError(null); setBusy(true);
    try {
      const form = new FormData();
      form.append("doctorType", proForm.doctorType);
      form.append("licenseNumber", proForm.licenseNumber.trim());
      if (proForm.doctorType === "Specialist" && proForm.specialtyId) form.append("specialtyId", proForm.specialtyId);
      if (proForm.clinicId) form.append("clinicId", proForm.clinicId);
      if (proForm.bio) form.append("bio", proForm.bio);
      if (proForm.document) form.append("document", proForm.document);
      await apiFetch("/api/doctor-applications", { method: "POST", body: form, isForm: true });
      // The account is now on hold until an administrator decides — don't
      // leave them sitting on a token that every next API call will 403 on.
      await logout();
      setStep(3);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-visual-inner">
          <Link to="/welcome" className="auth-brandmark"><img src={logo} alt="" /> {t("app_name")}</Link>
          <h1>{t("auth.tagline")}</h1>
          <p>{t("auth.tagline_desc")}</p>
          <ul className="auth-visual-points">
            <li>🔒 {t("auth.point_secure")}</li>
            <li>🩺 {t("auth.point_verified")}</li>
            <li>💬 {t("auth.point_messaging")}</li>
          </ul>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-toplinks">
            <button className={mode === "login" ? "auth-toplink active" : "auth-toplink"} onClick={() => { setMode("login"); setError(null); setStep(1); setTwoFactorToken(null); }}>{t("auth.sign_in")}</button>
            <button className={mode === "register" ? "auth-toplink active" : "auth-toplink"} onClick={() => { setMode("register"); setError(null); setStep(1); setTwoFactorToken(null); }}>{t("auth.create_account")}</button>
          </div>

          {error && <div className="auth-error">{error}</div>}

          {mode === "login" && !twoFactorToken && (
            <>
              <h2 className="auth-heading">{t("auth.welcome_back")}</h2>
              <form onSubmit={submitLogin}>
                <Field label={t("auth.email")}>
                  <input type="email" required autoComplete="email" value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
                </Field>
                <Field label={t("auth.password")}>
                  <input type="password" required autoComplete="current-password" value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
                </Field>
                <div className="row-between" style={{ marginBottom: 16, marginTop: -4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--slate)" }}>
                    <input type="checkbox" checked={loginForm.rememberMe} style={{ width: "auto" }}
                      onChange={(e) => setLoginForm({ ...loginForm, rememberMe: e.target.checked })} />
                    {t("auth.remember_me")}
                  </label>
                  <Link to="/forgot-password" style={{ fontSize: 12.5 }}>{t("auth.forgot_password")}</Link>
                </div>
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "…" : t("auth.sign_in")}</button>
              </form>
            </>
          )}

          {mode === "login" && twoFactorToken && (
            <>
              <h2 className="auth-heading">{t("auth.two_factor_title")}</h2>
              <p className="auth-subtext">{t("auth.two_factor_body")}</p>
              <form onSubmit={submitTwoFactor}>
                <Field label={t("auth.two_factor_code_label")}>
                  <input
                    inputMode="numeric"
                    autoFocus
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                  />
                </Field>
                <button className="auth-submit" type="submit" disabled={busy || !twoFactorCode.trim()}>
                  {busy ? "…" : t("auth.verify_and_sign_in")}
                </button>
                <button
                  type="button"
                  className="auth-toplink"
                  style={{ marginTop: 10 }}
                  onClick={() => { setTwoFactorToken(null); setTwoFactorCode(""); setError(null); }}
                >
                  {t("common.back")}
                </button>
              </form>
            </>
          )}

          {mode === "register" && step === 1 && (
            <>
              <h2 className="auth-heading">{t("auth.create_your_account")}</h2>
              <div className="role-toggle">
                <button type="button" className={intent === "Patient" ? "role-option active" : "role-option"} onClick={() => setIntent("Patient")}>
                  <span className="role-icon">🧑</span>
                  <span>
                    <strong>{t("auth.patient_role")}</strong>
                    <small>{t("auth.patient_desc")}</small>
                  </span>
                </button>
                <button type="button" className={intent === "Doctor" ? "role-option active" : "role-option"} onClick={() => setIntent("Doctor")}>
                  <span className="role-icon">🩺</span>
                  <span>
                    <strong>{t("auth.doctor_role")}</strong>
                    <small>{t("auth.doctor_desc")}</small>
                  </span>
                </button>
              </div>

              {intent === "Doctor" && (
                <div className="auth-note">
                  🔒 {t("auth.doctor_note")}
                </div>
              )}

              <form onSubmit={submitAccountStep}>
                <Field label={t("auth.full_name")}>
                  <input required autoComplete="name" value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} />
                </Field>
                <div className="auth-2col">
                  <Field label={t("auth.email")}>
                    <input type="email" required autoComplete="email" value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} />
                  </Field>
                  <Field label={t("auth.dob")}>
                    <input type="date" required value={regForm.dob} onChange={(e) => setRegForm({ ...regForm, dob: e.target.value })} />
                  </Field>
                </div>
                <Field label={t("auth.phone")} hint={t("auth.phone_hint")}>
                  <input type="tel" autoComplete="tel" placeholder="6XX XXX XXX" value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} />
                </Field>
                <Field label={t("auth.gender")}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                      <input type="radio" name="gender" value="Male" checked={regForm.gender === "Male"}
                        onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })} style={{ width: "auto" }} />
                      {t("auth.gender_male")}
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                      <input type="radio" name="gender" value="Female" checked={regForm.gender === "Female"}
                        onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })} style={{ width: "auto" }} />
                      {t("auth.gender_female")}
                    </label>
                  </div>
                </Field>
                <div className="auth-2col">
                  <Field label={t("auth.password")} hint={t("auth.password_hint")}>
                    <input type="password" required autoComplete="new-password" value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} />
                  </Field>
                  <Field label={t("auth.confirm_password")}>
                    <input type="password" required autoComplete="new-password" value={regForm.password2} onChange={(e) => setRegForm({ ...regForm, password2: e.target.value })} />
                  </Field>
                </div>
                <button className="auth-submit" type="submit" disabled={busy}>
                  {busy ? "…" : intent === "Doctor" ? t("auth.continue_to_professional") : t("auth.create_account")}
                </button>
              </form>
            </>
          )}

          {mode === "register" && step === 2 && (
            <>
              <h2 className="auth-heading">{t("auth.professional_details")}</h2>
              <p className="auth-subtext">{t("auth.professional_details_note")}</p>
              <form onSubmit={submitProfessionalStep}>
                <Field label={t("auth.im_a")}>
                  <div className="role-toggle">
                    <button type="button" className={proForm.doctorType === "Generalist" ? "role-option active" : "role-option"} onClick={() => setProForm({ ...proForm, doctorType: "Generalist", specialtyId: "" })}>
                      <span className="role-icon">🩺</span>
                      <span><strong>{t("auth.generalist")}</strong><small>{t("auth.generalist_desc")}</small></span>
                    </button>
                    <button type="button" className={proForm.doctorType === "Specialist" ? "role-option active" : "role-option"} onClick={() => setProForm({ ...proForm, doctorType: "Specialist" })}>
                      <span className="role-icon">🔬</span>
                      <span><strong>{t("auth.specialist_role")}</strong><small>{t("auth.specialist_desc")}</small></span>
                    </button>
                  </div>
                </Field>
                <Field label={`${t("auth.license_number")} *`}>
                  <input required value={proForm.licenseNumber} onChange={(e) => setProForm({ ...proForm, licenseNumber: e.target.value })} />
                </Field>
                <div className="auth-2col">
                  {proForm.doctorType === "Specialist" && (
                    <Field label={`${t("auth.specialty")} *`}>
                      <select required value={proForm.specialtyId} onChange={(e) => setProForm({ ...proForm, specialtyId: e.target.value })}>
                        <option value="">{t("auth.select_ellipsis")}</option>
                        {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label={t("auth.clinic")}>
                    <select value={proForm.clinicId} onChange={(e) => setProForm({ ...proForm, clinicId: e.target.value })}>
                      <option value="">{t("auth.select_ellipsis")}</option>
                      {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={t("auth.professional_bio")}>
                  <textarea rows={3} value={proForm.bio} onChange={(e) => setProForm({ ...proForm, bio: e.target.value })} />
                </Field>
                <Field label={t("auth.verification_document")} hint={t("auth.verification_document_hint")}>
                  <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setProForm({ ...proForm, document: e.target.files[0] || null })} />
                </Field>
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "…" : t("auth.submit_for_verification")}</button>
              </form>
            </>
          )}

          {mode === "register" && step === 3 && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🕑</div>
              <h2 className="auth-heading">{t("auth.application_submitted_title")}</h2>
              <p className="auth-subtext">{t("auth.application_submitted_body")}</p>
              <button className="auth-submit" onClick={() => { setMode("login"); setStep(1); }}>{t("auth.back_to_sign_in")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
