import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card, Field, Pill, ErrorBanner, EmptyState } from "../components/ui";

export function Appointments() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDoctor = user.role === "Doctor" || user.role === "Specialist";
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(null);

  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleDayFull, setRescheduleDayFull] = useState(false);
  const [rescheduleSlot, setRescheduleSlot] = useState(null);
  const [reschedulingBusy, setReschedulingBusy] = useState(false);

  async function load() {
    try {
      const data = await apiFetch("/api/appointments");
      setAppointments(data.appointments);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) {
    try { await apiFetch(`/api/appointments/${id}`, { method: "PATCH", body: { status } }); load(); }
    catch (err) { setError(err.message); }
  }

  async function cancelMine(id) {
    try { await apiFetch(`/api/appointments/${id}/cancel`, { method: "PATCH" }); load(); }
    catch (err) { setError(err.message); }
  }

  async function messageAbout(a) {
    setMessaging(a.id); setError(null);
    try {
      const body = isDoctor ? { patientId: a.patient_id } : { doctorId: a.doctor_id };
      await apiFetch("/api/conversations", { method: "POST", body });
      navigate("/messages");
    } catch (err) { setError(err.message); } finally { setMessaging(null); }
  }

  function openReschedule(a) {
    setReschedulingId(a.id);
    setRescheduleDate(String(a.scheduled_date).slice(0, 10));
    setRescheduleSlot(null);
    setRescheduleSlots([]);
  }
  function closeReschedule() {
    setReschedulingId(null);
    setRescheduleSlots([]);
    setRescheduleSlot(null);
  }

  useEffect(() => {
    if (!reschedulingId || !rescheduleDate) return;
    const a = appointments.find((x) => x.id === reschedulingId);
    if (!a) return;
    apiFetch(`/api/doctors/${a.doctor_id}/slots?date=${rescheduleDate}`)
      .then((data) => { setRescheduleSlots(data.slots); setRescheduleDayFull(!!data.full); })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reschedulingId, rescheduleDate]);

  async function confirmReschedule() {
    if (!rescheduleSlot) return;
    setReschedulingBusy(true); setError(null);
    try {
      const endpoint = isDoctor
        ? { url: `/api/appointments/${reschedulingId}`, body: { status: "Rescheduled", date: rescheduleDate, time: rescheduleSlot } }
        : { url: `/api/appointments/${reschedulingId}/reschedule`, body: { date: rescheduleDate, time: rescheduleSlot } };
      await apiFetch(endpoint.url, { method: "PATCH", body: endpoint.body });
      closeReschedule();
      load();
    } catch (err) { setError(err.message); } finally { setReschedulingBusy(false); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{isDoctor ? t("appointments.title") : t("appointments.my_title")}</h2>
      <ErrorBanner message={error} />

      {appointments.length === 0 && <Card><p style={{ fontSize: 13, margin: 0, color: "var(--slate)" }}>{t("appointments.no_upcoming")}</p></Card>}
      {appointments.map((a) => (
        <Card key={a.id}>
          <div className="row-between">
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{isDoctor ? a.patient_name : a.doctor_name}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--slate-dim)" }}>{String(a.scheduled_date).slice(0, 10)} · {String(a.scheduled_time).slice(0, 5)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Pill tone={a.status === "Confirmed" ? "active" : (a.status === "Cancelled" || a.status === "Rejected") ? "critical" : "warning"}>{t(`status.${a.status}`)}</Pill>
              {["Pending", "Confirmed"].includes(a.status) && (
                <button className="btn ghost small" disabled={messaging === a.id} onClick={() => messageAbout(a)}>
                  💬 {messaging === a.id ? t("appointments.starting_conversation") : t("appointments.message")}
                </button>
              )}
              {isDoctor && a.status === "Pending" && (
                <>
                  <button className="btn ghost small" onClick={() => setStatus(a.id, "Confirmed")}>✓ {t("appointments.accept")}</button>
                  <button className="btn ghost small" onClick={() => setStatus(a.id, "Rejected")}>✕ {t("appointments.reject")}</button>
                </>
              )}
              {isDoctor && a.status === "Confirmed" && (
                <button className="btn sage small" onClick={() => setStatus(a.id, "Completed")}>✓ {t("appointments.complete")}</button>
              )}
              {["Pending", "Confirmed"].includes(a.status) && (
                <button className="btn ghost small" onClick={() => openReschedule(a)}>📅 {t("appointments.reschedule")}</button>
              )}
              {!isDoctor && ["Pending", "Confirmed"].includes(a.status) && (
                <button className="btn ghost small" onClick={() => cancelMine(a.id)}>{t("appointments.cancel")}</button>
              )}
            </div>
          </div>

          {reschedulingId === a.id && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <Field label={t("appointments.reschedule_pick_time")}>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleSlot(null); }}
                  style={{ marginBottom: 10 }}
                />
                {rescheduleSlots.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--slate)" }}>
                    {rescheduleDayFull ? t("appointments.day_full") : t("appointments.no_open_slots")}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {rescheduleSlots.map((s) => (
                    <button
                      key={s}
                      onClick={() => setRescheduleSlot(s)}
                      className={rescheduleSlot === s ? "btn small" : "btn ghost small"}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn small" disabled={!rescheduleSlot || reschedulingBusy} onClick={confirmReschedule}>
                  {t("appointments.confirm_reschedule")}
                </button>
                <button className="btn ghost small" onClick={closeReschedule}>{t("appointments.cancel_reschedule")}</button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
