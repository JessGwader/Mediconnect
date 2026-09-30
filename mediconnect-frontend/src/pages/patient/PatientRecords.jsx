import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, apiDownload } from "../../api/client";
import { Card, Pill, EmptyState, ErrorBanner } from "../../components/ui";

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function PatientRecords() {
  const { t } = useTranslation();
  const [patient, setPatient] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await apiFetch("/api/patients/me");
        setPatient(p.patient);
        const [c, rx, docs] = await Promise.all([
          apiFetch(`/api/patients/${p.patient.id}/consultations`),
          apiFetch(`/api/patients/${p.patient.id}/prescriptions`),
          apiFetch(`/api/patients/${p.patient.id}/documents`),
        ]);
        setConsultations(c.consultations); setPrescriptions(rx.prescriptions); setDocuments(docs.documents);
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    })();
  }, []);

  async function downloadDoc(doc) {
    try {
      const blob = await apiDownload(`/api/patients/${patient.id}/documents/${doc.id}/download`);
      download(blob, doc.file_name);
    } catch (err) { setError(err.message); }
  }

  async function downloadRxPdf(rx) {
    try {
      const blob = await apiDownload(`/api/patients/${patient.id}/prescriptions/${rx.id}/pdf`);
      download(blob, `prescription-${rx.id}.pdf`);
    } catch (err) { setError(err.message); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("records.title")}</h2>
      <ErrorBanner message={error} />
      {patient && <p className="mono" style={{ fontSize: 12, color: "var(--slate-dim)", marginTop: -10, marginBottom: 16 }}>{patient.mrn}</p>}

      <Card title={t("records.allergies")}>
        {(patient?.allergies || []).length === 0
          ? <span style={{ fontSize: 13, color: "var(--slate)" }}>{t("records.none_on_file")}</span>
          : patient.allergies.map((a) => <Pill key={a} tone="critical">⚠ {a}</Pill>)}
      </Card>

      <Card title={t("records.consultation_history")}>
        {consultations.length === 0 && <span style={{ fontSize: 13, color: "var(--slate)" }}>{t("records.no_consultations")}</span>}
        {consultations.map((c) => (
          <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <strong>{String(c.created_at).slice(0, 10)}</strong> — {c.diagnosis || t("records.consultation_notes_on_file")}
          </div>
        ))}
      </Card>

      <Card title={t("records.prescriptions")}>
        {prescriptions.length === 0 && <span style={{ fontSize: 13, color: "var(--slate)" }}>{t("records.none_on_file")}</span>}
        {prescriptions.map((rx) => (
          <div key={rx.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span>{rx.medication}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Pill tone={rx.status === "Active" ? "active" : "neutral"}>{t(`status.${rx.status}`)}</Pill>
              <button className="btn ghost small" onClick={() => downloadRxPdf(rx)}>📄 PDF</button>
            </span>
          </div>
        ))}
      </Card>

      <Card title={t("records.documents")}>
        {documents.length === 0 && <span style={{ fontSize: 13, color: "var(--slate)" }}>{t("records.no_documents_shared")}</span>}
        {documents.map((d) => (
          <div key={d.id} className="row-between" style={{ padding: "6px 0", fontSize: 13 }}>
            <span>{d.file_name}</span>
            <button className="btn ghost small" onClick={() => downloadDoc(d)}>{t("common.download")}</button>
          </div>
        ))}
      </Card>

      <p className="hint">🔒 {t("records.ai_note")}</p>
    </div>
  );
}
