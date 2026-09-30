import { useEffect, useState } from "react";
import { apiDownload } from "../api/client";

export function Card({ title, action, children, style }) {
  return (
    <div className="card" style={style}>
      {title && (
        <div className="card-head">
          <h3 className="card-title">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", small, disabled, type = "button" }) {
  const cls = ["btn"];
  if (variant !== "primary") cls.push(variant);
  if (small) cls.push("small");
  return (
    <button type={type} className={cls.join(" ")} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Pill({ tone = "neutral", children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={wide ? { width: 640 } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="display" style={{ margin: 0, fontSize: 19 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "var(--slate)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ children }) {
  return <p className="spinner-note">{children}</p>;
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return <div className="auth-error" style={{ marginBottom: 14 }}>{message}</div>;
}

// Fetches a user's profile picture as an authenticated blob (an <img src>
// can't carry a Bearer token) and falls back to an initials circle when
// there isn't one — a profile picture is always optional, never required.
export function Avatar({ userId, name, hasAvatar, size = 40 }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    if (userId && hasAvatar !== false) {
      apiDownload(`/api/users/${userId}/avatar`)
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        })
        .catch(() => { /* no avatar set — fall back to initials */ });
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [userId, hasAvatar]);

  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  if (src) {
    return <img src={src} alt={name || ""} width={size} height={size}
      style={{ borderRadius: "50%", objectFit: "cover", border: "1px solid var(--line)", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "var(--brand-grad)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.38,
    }}>
      {initials || "🧑"}
    </div>
  );
}

// Read-only star display for an average rating.
export function StarRating({ value, count, size = 13 }) {
  if (value == null) return <span style={{ fontSize: size, color: "var(--slate-dim)" }}>—</span>;
  const rounded = Math.round(value);
  return (
    <span style={{ fontSize: size, whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--amber)" }}>{"★".repeat(rounded)}</span>
      <span style={{ color: "var(--line)" }}>{"★".repeat(5 - rounded)}</span>
      <span style={{ color: "var(--slate-dim)", marginLeft: 4, fontSize: size - 1 }}>
        {value.toFixed(1)}{count != null ? ` (${count})` : ""}
      </span>
    </span>
  );
}

// Interactive star picker for submitting a rating (1-5, click to set).
export function StarInput({ value, onChange }) {
  return (
    <span style={{ fontSize: 26, letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: n <= value ? "var(--amber)" : "var(--line)" }}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >★</button>
      ))}
    </span>
  );
}
