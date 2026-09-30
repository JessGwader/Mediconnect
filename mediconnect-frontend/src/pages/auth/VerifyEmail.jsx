import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";

export function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [status, setStatus] = useState("checking"); // checking | success | error

  useEffect(() => {
    const token = params.get("token");
    if (!token) { setStatus("error"); return; }
    apiFetch("/api/auth/verify-email", { method: "POST", body: { token } })
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [params]);

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        {status === "checking" && <p>{t("auth.verify_email_title")}</p>}
        {status === "success" && (
          <>
            <p style={{ color: "var(--sage)", fontWeight: 600 }}>✓ {t("auth.verify_success")}</p>
            <Link to="/login" className="btn" style={{ display: "inline-flex", marginTop: 10 }}>{t("auth.sign_in")}</Link>
          </>
        )}
        {status === "error" && <p style={{ color: "var(--red)" }}>{t("auth.verify_failed")}</p>}
      </div>
    </div>
  );
}
