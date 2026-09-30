import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Pill, EmptyState, ErrorBanner } from "../../components/ui";

export function DoctorQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const handle = setTimeout(() => {
      apiFetch(`/api/patients${params}`)
        .then((data) => setPatients(data.patients))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <h2 className="page-title" style={{ margin: 0 }}>{t("doctor.patient_queue")}</h2>
        <input placeholder={t("doctor.search_patients")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
      </div>
      <ErrorBanner message={error} />
      {loading ? <EmptyState>{t("common.loading")}</EmptyState> : (
        <div className="grid-cards">
          {patients.length === 0 && <EmptyState>{t("doctor.no_patients_found")}</EmptyState>}
          {patients.map((p) => (
            <div key={p.id} className="card" style={{ cursor: "pointer" }} onClick={() => navigate(`/patients/${p.id}`)}>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</span>
                <span style={{ color: "var(--slate-dim)" }}>›</span>
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--slate-dim)", marginBottom: 8 }}>{p.mrn} · {p.department || "—"}</div>
              <Pill tone={p.status === "Admitted" ? "warning" : "info"}>{t(`status.${p.status}`, p.status)}</Pill>
              {(p.allergies || []).length > 0 && <Pill tone="critical">⚠ {t("doctor.allergy_count", { count: p.allergies.length })}</Pill>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
