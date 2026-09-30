import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];
  const filtered = SUPPORTED_LANGUAGES.filter((l) => l.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} title="Change language">
        🌐 {current.code.toUpperCase()}
      </button>
      {open && (
        <div className="dropdown" style={{ width: 220 }}>
          <input
            autoFocus
            placeholder={t("common.search_language")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          {filtered.length === 0 && <div className="spinner-note">{t("common.no_languages_match")}</div>}
          {filtered.map((l) => (
            <button
              key={l.code}
              onClick={() => { i18n.changeLanguage(l.code); setOpen(false); setQuery(""); }}
              style={{
                display: "block", width: "100%", textAlign: "left", background: l.code === current.code ? "var(--sage-soft)" : "transparent",
                border: "none", padding: "8px 10px", borderRadius: 6, fontSize: 13, color: "var(--text)",
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
