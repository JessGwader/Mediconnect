import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, Pill, EmptyState, ErrorBanner, Avatar, StarRating } from "../../components/ui";

const STATUS_TONE = { Available: "active", Full: "warning", Unavailable: "critical" };

export function FindDoctor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [specialties, setSpecialties] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([apiFetch("/api/specialties"), apiFetch("/api/clinics")]);
        setSpecialties(s.specialties); setClinics(c.clinics);
      } catch (err) { setError(err.message); }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (specialtyId) params.set("specialtyId", specialtyId);
    if (clinicId) params.set("clinicId", clinicId);
    if (status) params.set("status", status);
    if (sort) params.set("sort", sort);
    setLoading(true);
    apiFetch(`/api/doctors?${params.toString()}`)
      .then((data) => setDoctors(data.doctors))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, specialtyId, clinicId, status, sort]);

  return (
    <div>
      <h2 className="page-title">{t("find_doctor.title")}</h2>
      <ErrorBanner message={error} />

      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder={t("find_doctor.search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 2, minWidth: 180 }} />
          <select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            <option value="">{t("find_doctor.all_specialties")}</option>
            {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            <option value="">{t("find_doctor.all_clinics")}</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            <option value="">{t("find_doctor.any_status")}</option>
            <option value="Available">{t("status.Available")}</option>
            <option value="Full">{t("status.Full")}</option>
            <option value="Unavailable">{t("status.Unavailable")}</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            <option value="">{t("find_doctor.sort_default")}</option>
            <option value="rating">{t("find_doctor.sort_rating")}</option>
          </select>
        </div>
      </Card>

      {loading ? <EmptyState>{t("find_doctor.searching")}</EmptyState> : (
        <div className="grid-cards">
          {doctors.length === 0 && <EmptyState>{t("find_doctor.no_match")}</EmptyState>}
          {doctors.map((d) => (
            <div key={d.id} className="card" style={{ cursor: d.status === "Unavailable" ? "default" : "pointer", opacity: d.status === "Unavailable" ? 0.7 : 1 }}
              onClick={() => d.status !== "Unavailable" && navigate(`/doctors/${d.id}`)}>
              <div className="row-between" style={{ alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Avatar userId={d.id} name={d.name} hasAvatar={d.hasAvatar} size={44} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{d.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 2 }}>{d.specialty_name || d.specialty || "General"}</div>
                    <div style={{ marginTop: 3 }}><StarRating value={d.avgRating} count={d.ratingCount} /></div>
                  </div>
                </div>
                <Pill tone={STATUS_TONE[d.status] || "neutral"}>{t(`status.${d.status}`)}</Pill>
              </div>
              {d.clinic_name && <div style={{ fontSize: 11.5, color: "var(--slate-dim)", marginTop: 6 }}>📍 {d.clinic_name}{d.clinic_city ? `, ${d.clinic_city}` : ""}</div>}
              {d.status === "Full" && <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 4 }}>{t("find_doctor.full_note")}</div>}
              {d.status === "Unavailable" && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{t("find_doctor.unavailable_note")}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
