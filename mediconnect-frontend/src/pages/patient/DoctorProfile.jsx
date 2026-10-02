import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../api/client";
import { Card, Field, ErrorBanner, EmptyState, Avatar, StarRating, StarInput } from "../../components/ui";
import { formatXAF } from "../../utils/currency";

const CONSULTATION_FEE = 25;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

export function DoctorProfile() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState([]);
  const [dayFull, setDayFull] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [ratableAppointments, setRatableAppointments] = useState([]);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingAppointmentId, setRatingAppointmentId] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const [phone, setPhone] = useState("");
  const [payState, setPayState] = useState("idle"); // idle | submitting | pending | success | failed | unconfirmed
  const [lastTransactionRef, setLastTransactionRef] = useState(null);
  const pollRef = useRef(null);
  const pollDeadlineRef = useRef(0);

  useEffect(() => {
    apiFetch(`/api/doctors?search=`).then((data) => {
      const found = data.doctors.find((d) => d.id === id);
      setDoctor(found || { id, name: "Doctor" });
    }).catch(() => setDoctor({ id, name: "Doctor" }));
  }, [id]);

  useEffect(() => {
    setSelectedSlot(null);
    apiFetch(`/api/doctors/${id}/slots?date=${date}`)
      .then((data) => { setSlots(data.slots); setDayFull(!!data.full); })
      .catch((err) => setError(err.message));
  }, [id, date]);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  useEffect(() => {
    apiFetch(`/api/doctors/${id}/ratings`).then((d) => setRatings(d.ratings)).catch(() => {});
    apiFetch(`/api/doctors/${id}/ratable-appointments`).then((d) => {
      setRatableAppointments(d.ratableAppointments);
      if (d.ratableAppointments[0]) setRatingAppointmentId(d.ratableAppointments[0].appointment_id);
    }).catch(() => {});
  }, [id]);

  async function submitRating() {
    if (!ratingAppointmentId || !ratingValue) return;
    setRatingBusy(true);
    try {
      await apiFetch(`/api/doctors/${id}/ratings`, {
        method: "POST",
        body: { appointmentId: ratingAppointmentId, rating: ratingValue, comment: ratingComment.trim() || undefined },
      });
      setRatingSubmitted(true);
      setRatableAppointments((prev) => prev.filter((a) => a.appointment_id !== ratingAppointmentId));
      const refreshed = await apiFetch(`/api/doctors/${id}/ratings`);
      setRatings(refreshed.ratings);
    } catch (err) { setError(err.message); } finally { setRatingBusy(false); }
  }

  async function bookAppointment() {
    if (!selectedSlot) return;
    setBooking(true); setError(null);
    try {
      const data = await apiFetch("/api/appointments", { method: "POST", body: { doctorId: id, date, time: selectedSlot } });
      setBookedAppointment(data.appointment);
    } catch (err) { setError(err.message); } finally { setBooking(false); }
  }

  // Only Campay's own verified status can mean "failed" — a poll timing out
  // does NOT mean the payment failed, since a slow mobile money PIN prompt
  // can easily take longer than our poll window while the payment still
  // goes through moments later. Treating "still pending" the same as
  // "failed" was what made confirmed payments look like errors, so a
  // timeout now lands on a distinct "unconfirmed" state instead, with a
  // manual recheck rather than a re-prompt to pay again.
  function pollStatus(transactionRef) {
    pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    const tick = async () => {
      try {
        const data = await apiFetch(`/api/payments/${transactionRef}/status`);
        const status = data.payment.status;
        if (status === "Successful") { setPayState("success"); return; }
        if (status === "Failed" || status === "Cancelled") { setPayState("failed"); return; }
        if (Date.now() > pollDeadlineRef.current) { setPayState("unconfirmed"); return; }
        pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        setError(err.message);
        setPayState("unconfirmed");
      }
    };
    pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
  }

  async function payForAppointment() {
    setError(null);
    setPayState("submitting");
    try {
      const data = await apiFetch("/api/payments/initiate", {
        method: "POST",
        body: { appointmentId: bookedAppointment.id, phone },
      });
      setLastTransactionRef(data.payment.transaction_ref);
      setPayState("pending");
      pollStatus(data.payment.transaction_ref);
    } catch (err) {
      setError(err.message);
      setPayState("idle");
    }
  }

  async function recheckStatus() {
    if (!lastTransactionRef) return;
    setPayState("pending");
    pollStatus(lastTransactionRef);
  }

  if (!doctor) return <EmptyState>{t("doctor_public_profile.loading_doctor")}</EmptyState>;

  return (
    <div>
      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 12.5, marginBottom: 14 }}>{t("doctor_public_profile.back")}</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Avatar userId={doctor.id} name={doctor.name} hasAvatar={doctor.hasAvatar} size={52} />
        <div>
          <h2 className="page-title" style={{ marginBottom: 2 }}>{doctor.name}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{doctor.specialty_name || doctor.specialty || ""}</span>
            <StarRating value={doctor.avgRating} count={doctor.ratingCount} />
          </div>
        </div>
      </div>
      <ErrorBanner message={error} />

      {!bookedAppointment ? (
        <Card title={t("doctor_public_profile.book_appointment")}>
          <Field label={t("appointments.date_label")}>
            <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("appointments.available_times")}>
            {slots.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--slate)" }}>
                {dayFull ? t("appointments.day_full") : t("appointments.no_open_slots")}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSlot(s)}
                  className={selectedSlot === s ? "btn small" : "btn ghost small"}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <button className="btn" disabled={!selectedSlot || booking} onClick={bookAppointment}>
            {booking ? t("doctor_public_profile.booking") : t("appointments.book")}
          </button>
        </Card>
      ) : (
        <Card title={t("appointments.appointment_requested_title")}>
          <p style={{ fontSize: 13.5 }}>
            {t("appointments.appointment_requested_body", { date, time: bookedAppointment.scheduled_time?.slice(0, 5) || selectedSlot })}
          </p>

          {payState === "success" ? (
            <div className="pill active" style={{ marginTop: 12, fontSize: 13, padding: "8px 14px" }}>
              ✓ {t("appointments.payment_successful")}
            </div>
          ) : payState === "pending" || payState === "submitting" ? (
            <div style={{ marginTop: 14, textAlign: "center", padding: "18px 12px" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>📱</div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t("appointments.check_phone_title")}</div>
              <p style={{ fontSize: 13, color: "var(--slate)", marginTop: 4 }}>{t("appointments.check_phone_body")}</p>
              <p className="hint" style={{ marginTop: 10 }}>{t("appointments.payment_pending_wait")}</p>
            </div>
          ) : payState === "unconfirmed" ? (
            <div style={{ marginTop: 14, textAlign: "center", padding: "18px 12px" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t("appointments.payment_unconfirmed_title")}</div>
              <p style={{ fontSize: 13, color: "var(--slate)", marginTop: 4 }}>{t("appointments.payment_unconfirmed_body")}</p>
              <button className="btn ghost small" style={{ marginTop: 12 }} onClick={recheckStatus}>
                {t("appointments.check_status")}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div className="row-between" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: "var(--slate)" }}>{t("appointments.consultation_fee")}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{formatXAF(CONSULTATION_FEE)}</span>
              </div>

              {payState === "failed" && (
                <div className="pill critical" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 12px" }}>
                  {t("appointments.payment_failed")}
                </div>
              )}

              <Field label={t("appointments.phone_number")}>
                <input
                  type="tel"
                  placeholder={t("appointments.phone_placeholder")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>

              <button className="btn sage" disabled={!phone} onClick={payForAppointment} style={{ width: "100%", justifyContent: "center" }}>
                💳 {t("appointments.pay_button", { amount: formatXAF(CONSULTATION_FEE) })}
              </button>
            </div>
          )}
        </Card>
      )}

      {ratableAppointments.length > 0 && !ratingSubmitted && (
        <Card title={t("ratings.rate_this_doctor")}>
          {ratableAppointments.length > 1 && (
            <Field label={t("ratings.which_appointment")}>
              <select value={ratingAppointmentId} onChange={(e) => setRatingAppointmentId(e.target.value)}>
                {ratableAppointments.map((a) => (
                  <option key={a.appointment_id} value={a.appointment_id}>{String(a.scheduled_date).slice(0, 10)}</option>
                ))}
              </select>
            </Field>
          )}
          <div style={{ marginBottom: 12 }}>
            <StarInput value={ratingValue} onChange={setRatingValue} />
          </div>
          <Field label={t("ratings.comment_optional")}>
            <textarea rows={3} value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} placeholder={t("ratings.comment_placeholder")} />
          </Field>
          <button className="btn small" disabled={!ratingValue || ratingBusy} onClick={submitRating}>
            {ratingBusy ? "…" : t("ratings.submit_rating")}
          </button>
        </Card>
      )}
      {ratingSubmitted && (
        <div className="auth-note" style={{ marginBottom: 14 }}>{t("ratings.thanks_for_rating")}</div>
      )}

      <Card title={t("ratings.patient_reviews")}>
        {ratings.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("ratings.no_reviews_yet")}</p>
        ) : ratings.map((r) => (
          <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row-between">
              <strong style={{ fontSize: 13 }}>{r.patientDisplayName}</strong>
              <StarRating value={r.rating} />
            </div>
            {r.comment && <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 4 }}>{r.comment}</p>}
          </div>
        ))}
      </Card>
    </div>
  );
}
