import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, apiDownload } from "../../api/client";
import { Card, Pill, EmptyState, ErrorBanner, Avatar, StarRating } from "../../components/ui";

function Bar({ label, value, max, suffix = "" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row-between" style={{ fontSize: 12.5, marginBottom: 3 }}>
        <span>{label}</span><span className="mono" style={{ color: "var(--slate-dim)" }}>{value}{suffix}</span>
      </div>
      <div style={{ background: "var(--paper)", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: "var(--brand-grad)", height: "100%", borderRadius: 6, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

const DONUT_COLORS = ["var(--brand-blue)", "var(--brand-teal)", "var(--sage)", "var(--amber)", "var(--red)", "var(--slate)"];

// A dependency-free SVG donut — no chart library needed for a handful of slices.
function Donut({ segments, size = 128, thickness = 16 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      {segments.map((seg, i) => {
        const frac = seg.value / total;
        const dash = frac * c;
        const el = (
          <circle
            key={seg.label}
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={thickness}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// A dependency-free SVG radar/spider chart — mirrors the "Structure" panel
// on the reference dashboard, for a handful of comparable categories.
function RadarChart({ axes, size = 180 }) {
  const n = axes.length;
  const center = size / 2;
  const maxR = size / 2 - 28;
  const max = Math.max(1, ...axes.map((a) => a.value));
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointAt = (i, frac) => {
    const a = angle(i);
    return [center + Math.cos(a) * maxR * frac, center + Math.sin(a) * maxR * frac];
  };
  const rings = [0.33, 0.66, 1];
  const dataPoints = axes.map((a, i) => pointAt(i, a.value / max));
  const dataPath = dataPoints.map((p) => p.join(",")).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((r) => (
        <polygon
          key={r}
          points={axes.map((_, i) => pointAt(i, r).join(",")).join(" ")}
          fill="none" stroke="var(--line)" strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pointAt(i, 1);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
      })}
      <polygon points={dataPath} fill="var(--brand-teal)" fillOpacity={0.28} stroke="var(--brand-blue)" strokeWidth={2} />
      {dataPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="var(--brand-blue)" />)}
      {axes.map((a, i) => {
        const [lx, ly] = pointAt(i, 1.28);
        return (
          <text key={a.label} x={lx} y={ly} fontSize={10.5} fill="var(--slate-dim)"
            textAnchor={Math.abs(lx - center) < 4 ? "middle" : lx > center ? "start" : "end"}
            dominantBaseline={Math.abs(ly - center) < 4 ? "middle" : ly > center ? "hanging" : "auto"}>
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

// Animates a number counting up from 0 whenever its target value changes —
// used throughout the stat tiles so the dashboard feels alive on load,
// matching the "everything just goes up" feel requested for the finance-
// dashboard look.
function CountUp({ value, formatter, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const target = Number(value) || 0;
  useEffect(() => {
    let frame;
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  const rounded = Math.round(display);
  return <>{formatter ? formatter(rounded) : rounded.toLocaleString()}</>;
}

// Picks a small icon for an AI insight by skimming its own wording — purely
// cosmetic, no model call, so it works for both Gemini and rule-based text.
function insightIcon(text) {
  const s = text.toLowerCase();
  if (s.includes("workload") || s.includes("overload") || s.includes("busy")) return "⚠️";
  if (s.includes("increase") || s.includes("growth") || s.includes("up ")) return "📈";
  if (s.includes("decrease") || s.includes("drop") || s.includes("down ")) return "📉";
  if (s.includes("rating") || s.includes("review")) return "⭐";
  if (s.includes("specialty") || s.includes("demand")) return "🩺";
  if (s.includes("diagnosis") || s.includes("condition")) return "📋";
  return "💡";
}

function TrendBadge({ trend, t }) {
  const up = trend.direction === "up";
  const flat = trend.direction === "flat";
  const arrow = flat ? "→" : up ? "↗" : "↘";
  const tone = flat ? "neutral" : up ? "active" : "critical";
  return (
    <Pill tone={tone}>
      {arrow} {trend.deltaPct >= 0 ? "+" : ""}{trend.deltaPct}% {t("admin.vs_last_month")}
    </Pill>
  );
}

function formatXAF(n) {
  return `${Number(n).toLocaleString("fr-FR")} XAF`;
}

export function AdminStatistics() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    apiFetch("/api/statistics")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function regenerateInsights() {
    setRegenerating(true); setError(null);
    try {
      const result = await apiFetch("/api/statistics/generate-insights", { method: "POST" });
      setData((prev) => ({ ...prev, insights: result.insights, insightsSource: result.insightsSource, generatedOn: result.generatedOn }));
    } catch (err) { setError(err.message); } finally { setRegenerating(false); }
  }

  if (loading) return <EmptyState>{t("admin.generating_statistics")}</EmptyState>;
  if (!data) return <ErrorBanner message={error} />;

  async function downloadReport() {
    setError(null);
    try {
      const blob = await apiDownload("/api/statistics/report");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `mediconnect-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  }

  const specMax = Math.max(1, ...data.specialtyDemand.map((s) => s.count));
  const apptMax = Math.max(1, ...data.appointmentTrend.map((a) => a.count));
  const workMax = Math.max(1, ...data.doctorWorkload.map((d) => d.appointment_count));
  const condMax = Math.max(1, ...data.conditionFrequency.map((c) => c.count));
  const topSpecialty = data.specialtyDemand[0];
  const topBookedDoctor = data.mostBookedDoctors[0];
  const topRatedDoctor = data.topRatedDoctors[0];

  const paymentDonutSegments = data.paymentStats.map((p, i) => ({
    label: t(`status.${p.status}`, p.status), value: p.count, color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <h2 className="page-title" style={{ margin: 0 }}>{t("admin.statistics")}</h2>
        <button className="btn ghost small" onClick={downloadReport}>📄 {t("admin.download_report")}</button>
      </div>
      <ErrorBanner message={error} />

      <div style={{
        background: "linear-gradient(185deg, var(--sidebar-bg) 0%, var(--sidebar-bg-2) 130%)",
        borderRadius: "var(--radius)", padding: "22px 24px", marginBottom: 16,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 18, color: "var(--sidebar-fg)",
      }}>
        <div>
          <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: 4 }}>{t("admin.total_revenue")}</div>
          <div className="display" style={{ fontSize: 24, fontWeight: 600 }}><CountUp value={data.totalRevenue} formatter={formatXAF} /></div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: 4 }}>{t("admin.booking_trend")}</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}><CountUp value={data.bookingTrend.currentMonthCount} /></div>
          <TrendBadge trend={data.bookingTrend} t={t} />
        </div>
        <div>
          <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: 4 }}>{t("admin.most_booked_specialty")}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{topSpecialty?.specialty || "—"}</div>
          {topSpecialty && <div style={{ fontSize: 11.5, opacity: 0.75 }}>{topSpecialty.count} {t("admin.bookings_suffix")}</div>}
        </div>
        <div>
          <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: 4 }}>{t("admin.most_booked_doctor")}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{topBookedDoctor?.name || "—"}</div>
          {topBookedDoctor && <div style={{ fontSize: 11.5, opacity: 0.75 }}>{topBookedDoctor.bookingCount} {t("admin.bookings_suffix")}</div>}
        </div>
        <div>
          <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: 4 }}>{t("admin.top_rated_doctor")}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{topRatedDoctor?.name || "—"}</div>
          {topRatedDoctor && <div style={{ fontSize: 11.5, opacity: 0.75 }}>⭐ {topRatedDoctor.avgRating} ({topRatedDoctor.ratingCount})</div>}
        </div>
      </div>

      <div className={`ai-panel${regenerating ? " generating" : ""}`} style={{ marginBottom: 14 }}>
        <div className="row-between">
          <div className="ai-head"><span>✨</span><span>{t("admin.ai_insights")}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn ghost small" disabled={regenerating} onClick={regenerateInsights}>
              {regenerating ? t("admin.generating_insights") : `✨ ${t("admin.generate_insights")}`}
            </button>
          </div>
        </div>
        {data.insights.map((insight, i) => (
          <div key={i} className="ai-finding" style={{ animation: `ai-finding-in 0.4s ease both`, animationDelay: `${i * 90}ms` }}>
            <span>{insightIcon(insight)}</span><span>{insight}</span>
          </div>
        ))}
        <div className="ai-disclaimer">{data.disclaimer}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}><CountUp value={data.counts.patients} /></div><div style={{ fontSize: 12, color: "var(--slate)" }}>{t("admin.patients_label")}</div></Card>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}><CountUp value={data.counts.doctors} /></div><div style={{ fontSize: 12, color: "var(--slate)" }}>{t("admin.doctors_label")}</div></Card>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}><CountUp value={data.counts.appointments} /></div><div style={{ fontSize: 12, color: "var(--slate)" }}>{t("admin.appointments_label")}</div></Card>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: "var(--sage)" }}><CountUp value={data.counts.completed_appointments} /></div><div style={{ fontSize: 12, color: "var(--slate)" }}>{t("admin.completed_label")}</div></Card>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: "var(--red)" }}><CountUp value={data.counts.cancelled_appointments} /></div><div style={{ fontSize: 12, color: "var(--slate)" }}>{t("admin.cancelled_label")}</div></Card>
      </div>

      <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card title={t("admin.specialty_demand")}>
          {data.specialtyDemand.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_data_yet")}</p>}
          {data.specialtyDemand.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <RadarChart axes={data.specialtyDemand.slice(0, 6).map((s) => ({ label: s.specialty, value: s.count }))} />
            </div>
          )}
          {data.specialtyDemand.map((s) => <Bar key={s.specialty} label={s.specialty} value={s.count} max={specMax} />)}
        </Card>

        <Card title={t("admin.top_booked_doctors")}>
          {data.mostBookedDoctors.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_data_yet")}</p>}
          {data.mostBookedDoctors.map((d, i) => (
            <div key={d.id} className="row-between" style={{ padding: "8px 0", borderBottom: i < data.mostBookedDoctors.length - 1 ? "1px solid var(--line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar userId={d.id} name={d.name} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--slate-dim)" }}>{d.specialtyName || "—"}</div>
                </div>
              </div>
              <Pill tone="info">{d.bookingCount}</Pill>
            </div>
          ))}
        </Card>

        <Card title={t("admin.top_rated_doctors")}>
          {data.topRatedDoctors.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.not_enough_ratings")}</p>}
          {data.topRatedDoctors.map((d, i) => (
            <div key={d.id} className="row-between" style={{ padding: "8px 0", borderBottom: i < data.topRatedDoctors.length - 1 ? "1px solid var(--line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar userId={d.id} name={d.name} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--slate-dim)" }}>{d.specialtyName || "—"}</div>
                </div>
              </div>
              <StarRating value={d.avgRating} count={d.ratingCount} />
            </div>
          ))}
        </Card>

        <Card title={t("admin.payments_by_status")}>
          {data.paymentStats.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_payments_yet")}</p> : (
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <Donut segments={paymentDonutSegments} />
              <div style={{ flex: 1, minWidth: 140 }}>
                {data.paymentStats.map((row, i) => (
                  <div key={row.status} className="row-between" style={{ padding: "4px 0", fontSize: 12.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: DONUT_COLORS[i % DONUT_COLORS.length], display: "inline-block" }} />
                      {t(`status.${row.status}`, row.status)}
                    </span>
                    <span className="mono" style={{ fontSize: 11.5 }}>{row.count} · {formatXAF(row.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title={t("admin.appointment_trend")}>
          {data.appointmentTrend.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_data_yet")}</p>}
          {data.appointmentTrend.map((a) => <Bar key={a.month} label={a.month} value={a.count} max={apptMax} />)}
        </Card>

        <Card title={t("admin.doctor_workload")}>
          {data.doctorWorkload.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_data_yet")}</p>}
          {data.doctorWorkload.map((d) => <Bar key={d.id} label={d.name} value={d.appointment_count} max={workMax} />)}
        </Card>

        <Card title={t("admin.frequent_diagnoses")}>
          {data.conditionFrequency.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_data_yet")}</p>}
          {data.conditionFrequency.map((c) => <Bar key={c.diagnosis} label={c.diagnosis} value={c.count} max={condMax} />)}
        </Card>

        <Card title={t("admin.transfers_by_status")}>
          {data.transferStats.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>{t("admin.no_transfers_yet")}</p>}
          {data.transferStats.map((row) => (
            <div key={row.status} className="row-between" style={{ padding: "6px 0", fontSize: 13 }}>
              <span>{t(`status.${row.status}`, row.status)}</span><Pill tone="info">{row.count}</Pill>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
