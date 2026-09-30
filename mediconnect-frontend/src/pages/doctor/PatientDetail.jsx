import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, apiDownload } from "../../api/client";
import { Card, Field, Pill, Modal, ErrorBanner, EmptyState } from "../../components/ui";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function PatientDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [patient, setPatient] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [error, setError] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);

  async function reload() {
    try {
      const [p, c, rx, docs] = await Promise.all([
        apiFetch(`/api/patients/${id}`),
        apiFetch(`/api/patients/${id}/consultations`),
        apiFetch(`/api/patients/${id}/prescriptions`),
        apiFetch(`/api/patients/${id}/documents`),
      ]);
      setPatient(p.patient); setConsultations(c.consultations); setPrescriptions(rx.prescriptions); setDocuments(docs.documents);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { reload(); }, [id]);

  if (!patient) return <EmptyState>{t("doctor.back_to_patient")}</EmptyState>;

  const tabs = [
    ["overview", t("doctor.tab_overview")],
    ["consult", t("doctor.tab_new_consultation")],
    ["rx", t("doctor.tab_prescriptions")],
    ["docs", t("doctor.tab_documents")],
  ];

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 12.5, marginBottom: 14 }}>{t("doctor.back_to_queue")}</button>
      <ErrorBanner message={error} />
      <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h2 className="display" style={{ margin: 0, fontSize: 24 }}>{patient.name}</h2>
          <div className="mono" style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 4 }}>{patient.mrn} · {t("auth.dob")} {patient.dob || "—"} · {patient.department || "—"}</div>
          <div style={{ marginTop: 8 }}>
            {(patient.allergies || []).length === 0
              ? <Pill tone="neutral">{t("doctor.known_allergies")}</Pill>
              : patient.allergies.map((a) => <Pill key={a} tone="critical">⚠ {t("doctor.allergy_label", { name: a })}</Pill>)}
          </div>
        </div>
        <button className="btn ghost" onClick={async () => {
          const [d, c] = await Promise.all([apiFetch("/api/doctors"), apiFetch("/api/clinics")]);
          setDoctors(d.doctors); setClinics(c.clinics); setTransferOpen(true);
        }}>⇄ {t("doctor.request_transfer")}</button>
      </div>

      <div className="tabs">
        {tabs.map(([tabId, label]) => (
          <button key={tabId} className={"tab-btn" + (tab === tabId ? " active" : "")} onClick={() => setTab(tabId)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab consultations={consultations} t={t} />}
      {tab === "consult" && <ConsultTab patientId={id} onSaved={() => { setTab("overview"); reload(); }} setError={setError} t={t} />}
      {tab === "rx" && <RxTab patientId={id} prescriptions={prescriptions} onUpdated={reload} setError={setError} t={t} />}
      {tab === "docs" && <DocsTab patientId={id} documents={documents} onUpdated={reload} setError={setError} t={t} />}

      {transferOpen && (
        <Modal title={t("doctor.transfer_modal_title", { name: patient.name })} onClose={() => setTransferOpen(false)}>
          <TransferForm patientId={id} doctors={doctors} clinics={clinics} onDone={() => setTransferOpen(false)} setError={setError} t={t} />
        </Modal>
      )}
    </div>
  );
}

function OverviewTab({ consultations, t }) {
  if (consultations.length === 0) return <Card><p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>{t("doctor.no_consultations_recorded")}</p></Card>;
  return consultations.map((c) => (
    <Card key={c.id} title={String(c.created_at).slice(0, 10)}>
      <p style={{ fontSize: 13 }}><strong>{t("doctor.diagnosis")}:</strong> {c.diagnosis || "—"}</p>
      <p style={{ fontSize: 13 }}><strong>{t("doctor.symptoms")}:</strong> {c.symptoms}</p>
      <p style={{ fontSize: 13 }}>
        <strong>{t("doctor.vitals")}:</strong> {t("doctor.field_bp")} {c.vitals?.bp || "—"} · {t("doctor.field_hr")} {c.vitals?.hr || "—"} · {t("doctor.field_temp")} {c.vitals?.temp || "—"} · {t("doctor.field_spo2")} {c.vitals?.spo2 || "—"}
      </p>
    </Card>
  ));
}

function ConsultTab({ patientId, onSaved, setError, t }) {
  const [form, setForm] = useState({ symptoms: "", observations: "", diagnosis: "", bp: "", hr: "", temp: "", spo2: "", meds: "", labs: "", imaging: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    if (!form.symptoms || !form.observations) return;
    try {
      await apiFetch(`/api/patients/${patientId}/consultations`, {
        method: "POST",
        body: {
          symptoms: form.symptoms, observations: form.observations, diagnosis: form.diagnosis,
          vitals: { bp: form.bp, hr: form.hr, temp: form.temp, spo2: form.spo2 },
          medications: form.meds.split(",").map((s) => s.trim()).filter(Boolean),
          labs: form.labs, imaging: form.imaging,
        },
      });
      onSaved();
    } catch (err) { setError(err.message); }
  }

  return (
    <Card title={t("doctor.record_new_consultation")}>
      <Field label={`${t("doctor.field_symptoms")} *`}><textarea rows={2} value={form.symptoms} onChange={set("symptoms")} /></Field>
      <Field label={`${t("doctor.field_observations")} *`}><textarea rows={2} value={form.observations} onChange={set("observations")} /></Field>
      <Field label={t("doctor.diagnosis_optional")}><input value={form.diagnosis} onChange={set("diagnosis")} /></Field>
      <div className="vitals-grid">
        <Field label={t("doctor.field_bp")}><input placeholder="120/80" value={form.bp} onChange={set("bp")} /></Field>
        <Field label={t("doctor.field_hr")}><input placeholder="72" value={form.hr} onChange={set("hr")} /></Field>
        <Field label={t("doctor.field_temp")}><input placeholder="36.8" value={form.temp} onChange={set("temp")} /></Field>
        <Field label={t("doctor.field_spo2")}><input placeholder="98" value={form.spo2} onChange={set("spo2")} /></Field>
      </div>
      <Field label={t("doctor.current_medications")}><input value={form.meds} onChange={set("meds")} /></Field>
      <Field label={t("doctor.lab_results")}><textarea rows={2} value={form.labs} onChange={set("labs")} /></Field>
      <Field label={t("doctor.imaging_reports")}><textarea rows={2} value={form.imaging} onChange={set("imaging")} /></Field>
      <button className="btn" onClick={save}>📋 {t("doctor.save_consultation")}</button>
    </Card>
  );
}

function RxTab({ patientId, prescriptions, onUpdated, setError, t }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(null);

  async function add(override = false) {
    if (!name.trim()) return;
    try {
      await apiFetch(`/api/patients/${patientId}/prescriptions`, { method: "POST", body: { medication: name.trim(), override } });
      setPending(null); setName(""); onUpdated();
    } catch (err) {
      if (err.status === 409 && err.payload?.warnings) setPending({ warnings: err.payload.warnings });
      else setError(err.message);
    }
  }

  async function discontinue(rxId) {
    try {
      await apiFetch(`/api/patients/${patientId}/prescriptions/${rxId}`, { method: "PATCH", body: { status: "Discontinued" } });
      onUpdated();
    } catch (err) { setError(err.message); }
  }

  async function downloadPdf(rxId) {
    try {
      const blob = await apiDownload(`/api/patients/${patientId}/prescriptions/${rxId}/pdf`);
      triggerDownload(blob, `prescription-${rxId}.pdf`);
    } catch (err) { setError(err.message); }
  }

  return (
    <>
      <Card title={t("doctor.active_past_prescriptions")}>
        {prescriptions.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("doctor.no_prescriptions")}</p>}
        {prescriptions.map((rx) => (
          <div key={rx.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div>💊 {rx.medication} <span className="mono" style={{ fontSize: 11, color: "var(--slate-dim)" }}>· {String(rx.prescribed_on).slice(0, 10)}</span></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill tone={rx.status === "Active" ? "active" : "neutral"}>{t(`status.${rx.status}`)}</Pill>
              <button className="btn ghost small" onClick={() => downloadPdf(rx.id)}>📄 PDF</button>
              {rx.status === "Active" && <button className="btn ghost small" onClick={() => discontinue(rx.id)}>{t("doctor.discontinue_action")}</button>}
            </div>
          </div>
        ))}
      </Card>
      <Card title={t("doctor.new_prescription")}>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder={t("doctor.rx_placeholder")} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={() => add(false)}>+ {t("common.add")}</button>
        </div>
        {pending && (
          <div style={{ marginTop: 12 }}>
            {pending.warnings.map((w, i) => <div key={i} className={`warn-box ${w.level}`}>⚠ <span>{w.text}</span></div>)}
            {pending.warnings.some((w) => w.level === "critical") && (
              <button className="btn danger small" onClick={() => add(true)}>{t("doctor.prescribe_anyway")}</button>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

function DocsTab({ patientId, documents, onUpdated, setError, t }) {
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState("Lab Report");
  const docTypes = [
    ["Lab Report", t("doctor.doc_type_lab")],
    ["Imaging Report", t("doctor.doc_type_imaging")],
    ["Referral Letter", t("doctor.doc_type_referral")],
    ["Medical Certificate", t("doctor.doc_type_certificate")],
    ["Prescription", t("doctor.doc_type_prescription")],
    ["Hospital Document", t("doctor.doc_type_hospital")],
  ];

  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("docType", docType);
    try {
      await apiFetch(`/api/patients/${patientId}/documents`, { method: "POST", body: form, isForm: true });
      setFile(null); onUpdated();
    } catch (err) { setError(err.message); }
  }

  async function downloadDoc(doc) {
    try {
      const blob = await apiDownload(`/api/patients/${patientId}/documents/${doc.id}/download`);
      triggerDownload(blob, doc.file_name);
    } catch (err) { setError(err.message); }
  }

  return (
    <Card title={t("doctor.tab_documents")}>
      {documents.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("doctor.no_documents_uploaded")}</p>}
      {documents.map((d) => (
        <div key={d.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <span>📄 {d.file_name}</span>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="mono" style={{ color: "var(--slate-dim)", fontSize: 11.5 }}>{d.doc_type}</span>
            <button className="btn ghost small" onClick={() => downloadDoc(d)}>{t("common.download")}</button>
          </span>
        </div>
      ))}
      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} style={{ flex: 1 }} />
        <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ width: 170 }}>
          {docTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="btn small" onClick={upload}>+ {t("doctor.upload_document")}</button>
      </div>
    </Card>
  );
}

function TransferForm({ patientId, doctors, clinics, onDone, setError, t }) {
  const [toDoctorId, setToDoctorId] = useState("");
  const [toClinicId, setToClinicId] = useState("");
  const [reason, setReason] = useState("");

  async function submit() {
    try {
      await apiFetch("/api/transfers", {
        method: "POST",
        body: { patientId, toDoctorId: toDoctorId || undefined, toClinicId: toClinicId || undefined, reason },
      });
      onDone();
    } catch (err) { setError(err.message); }
  }

  return (
    <>
      <Field label={t("doctor.destination_doctor")}>
        <select value={toDoctorId} onChange={(e) => setToDoctorId(e.target.value)}>
          <option value="">{t("profile.none_option")}</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialty_name ? ` — ${d.specialty_name}` : ""}</option>)}
        </select>
      </Field>
      <Field label={t("doctor.destination_clinic")}>
        <select value={toClinicId} onChange={(e) => setToClinicId(e.target.value)}>
          <option value="">{t("profile.none_option")}</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label={`${t("doctor.reason")} *`}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <p className="hint">{t("doctor.transfer_hint")}</p>
      <button className="btn" onClick={submit}>{t("doctor.submit_transfer")}</button>
    </>
  );
}
