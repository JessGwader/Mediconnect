import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Field } from "../../components/ui";

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await apiFetch("/api/auth/request-password-reset", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h3 className="display" style={{ marginTop: 0 }}>{t("auth.reset_password")}</h3>
        {error && <div className="auth-error">{error}</div>}
        {sent ? (
          <p className="auth-note">{t("auth.reset_sent")}</p>
        ) : (
          <form onSubmit={submit}>
            <Field label={t("auth.email")}>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <button className="btn" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "…" : t("auth.send_reset_link")}
            </button>
          </form>
        )}
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/login" style={{ fontSize: 12.5, color: "var(--slate)" }}>← {t("auth.sign_in")}</Link>
        </div>
      </div>
    </div>
  );
}
