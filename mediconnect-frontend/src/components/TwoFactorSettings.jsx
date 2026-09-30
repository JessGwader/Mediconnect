import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client";
import { Card, Field } from "./ui";

// Self-contained enable/disable flow for TOTP-based 2FA. Drop this into any
// profile page — it only needs the shared /api/auth/2fa/* endpoints, which
// work the same for every role.
export function TwoFactorSettings() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(null); // null = still loading
  const [stage, setStage] = useState("idle"); // idle | setup | disable
  const [secret, setSecret] = useState(null);
  const [otpauthUrl, setOtpauthUrl] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/auth/2fa/status").then((d) => setEnabled(d.enabled)).catch(() => setEnabled(false));
  }, []);

  async function startSetup() {
    setError(null); setBusy(true);
    try {
      const data = await apiFetch("/api/auth/2fa/setup", { method: "POST" });
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      setStage("setup");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function confirmEnable(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const data = await apiFetch("/api/auth/2fa/enable", { method: "POST", body: { code: code.trim() } });
      setRecoveryCodes(data.recoveryCodes);
      setEnabled(true);
      setCode("");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function disable(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await apiFetch("/api/auth/2fa/disable", { method: "POST", body: { password } });
      setEnabled(false);
      setStage("idle");
      setPassword("");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (enabled === null) return null;

  return (
    <Card title={t("profile.two_factor_title")}>
      {error && <div className="auth-error" style={{ marginBottom: 10 }}>{error}</div>}

      {recoveryCodes ? (
        <div>
          <p style={{ fontSize: 13, fontWeight: 700 }}>{t("profile.two_factor_enabled_success")}</p>
          <p className="hint">{t("profile.recovery_codes_hint")}</p>
          <div className="mono" style={{ background: "var(--surface-2, #f4f4f4)", padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.8 }}>
            {recoveryCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <button className="btn small" style={{ marginTop: 12 }} onClick={() => setRecoveryCodes(null)}>{t("common.done")}</button>
        </div>
      ) : enabled ? (
        stage === "disable" ? (
          <form onSubmit={disable}>
            <p className="hint">{t("profile.two_factor_disable_hint")}</p>
            <Field label={t("profile.current_password")}>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn danger small" type="submit" disabled={busy}>{busy ? "…" : t("profile.disable_two_factor")}</button>
              <button className="btn ghost small" type="button" onClick={() => { setStage("idle"); setPassword(""); setError(null); }}>{t("common.cancel")}</button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ fontSize: 13 }}>✅ {t("profile.two_factor_active")}</p>
            <button className="btn ghost small" onClick={() => setStage("disable")}>{t("profile.disable_two_factor")}</button>
          </div>
        )
      ) : stage === "setup" ? (
        <form onSubmit={confirmEnable}>
          <p className="hint">{t("profile.two_factor_setup_hint")}</p>
          <div className="mono" style={{ background: "var(--surface-2, #f4f4f4)", padding: 12, borderRadius: 8, fontSize: 13, wordBreak: "break-all", marginBottom: 10 }}>
            {secret}
          </div>
          <p className="hint" style={{ marginBottom: 10 }}>
            <a href={otpauthUrl} style={{ fontSize: 12 }}>{t("profile.otpauth_link")}</a>
          </p>
          <Field label={t("auth.two_factor_code_label")}>
            <input inputMode="numeric" autoFocus placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn small" type="submit" disabled={busy || !code.trim()}>{busy ? "…" : t("profile.confirm_enable")}</button>
            <button className="btn ghost small" type="button" onClick={() => { setStage("idle"); setError(null); }}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("profile.two_factor_intro")}</p>
          <button className="btn small" onClick={startSetup} disabled={busy}>{busy ? "…" : t("profile.enable_two_factor")}</button>
        </div>
      )}
    </Card>
  );
}
