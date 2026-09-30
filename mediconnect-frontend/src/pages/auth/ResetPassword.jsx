import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Field } from "../../components/ui";

export function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== password2) { setError(t("auth.passwords_no_match")); return; }
    const token = params.get("token");
    if (!token) { setError(t("auth.reset_token_missing")); return; }
    setError(null); setBusy(true);
    try {
      await apiFetch("/api/auth/reset-password", { method: "POST", body: { token, newPassword: password } });
      navigate("/login");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h3 className="display" style={{ marginTop: 0 }}>{t("auth.reset_password")}</h3>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          <Field label={t("auth.new_password")} hint={t("auth.password_hint")}>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t("auth.confirm_password")}>
            <input type="password" required value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </Field>
          <button className="btn" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {busy ? "…" : t("auth.reset_password")}
          </button>
        </form>
      </div>
    </div>
  );
}
