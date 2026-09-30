import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card, Avatar } from "./ui";

// Optional for every role — never required. Uploading replaces any existing
// picture; removing it just goes back to the initials circle.
export function AvatarUpload() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [hasAvatar, setHasAvatar] = useState(true); // start optimistic; Avatar itself falls back silently if none exists
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef(null);

  async function upload(file) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiFetch("/api/users/me/avatar", { method: "POST", body: form, isForm: true });
      setHasAvatar(true);
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(err.message); } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      await apiFetch("/api/users/me/avatar", { method: "DELETE" });
      setHasAvatar(false);
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Card title={t("profile.profile_picture")}>
      {error && <div className="auth-error" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar key={refreshKey} userId={user.id} name={user.name} hasAvatar={hasAvatar} size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p className="hint" style={{ margin: 0 }}>{t("profile.profile_picture_hint")}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => upload(e.target.files[0])}
            />
            <button className="btn ghost small" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {busy ? "…" : t("profile.upload_picture")}
            </button>
            <button className="btn ghost small" disabled={busy} onClick={remove}>{t("common.remove")}</button>
          </div>
        </div>
      </div>
    </Card>
  );
}
