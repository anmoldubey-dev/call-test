// ======================== Analytics Intelligence Orchestrator ========================
// AnalyticsPage -> Root analytical node for platform telemetry. Orchestrates
// call-level data streams, outcome distributions, and high-fidelity session
// deep-dives. Features a multi-modal audio engine and real-time transcript
// translation logic.
// ||
// ||
// ||
// Functions -> AnalyticsPage()-> Primary functional entry point for data analysis:
// ||           |
// ||           |--- getTranscript()-> [Logic Branch]: Resolves original vs.
// ||           |    translated text segments based on the selected locale.
// ||           |
// ||           |--- CallsTabView()-> [Sub-module]: Orchestrates summary stats
// ||           |    and relational call log registries via GET /analytics/calls.
// ||           |
// ||           └── Audio Player Engine:
// ||                ├── togglePlay()-> Sub-process: Manages hardware media state.
// ||                ├── skipBy()-> Sub-process: Temporal seek modulation.
// ||                └── cycleRate()-> Sub-process: Modulates playback velocity.
// ||
// =====================================================================================

import { useState, useEffect, useRef } from "react";
import api from "../../services/api";

// ---------------------------------------------------------------
// SECTION: DESIGN TOKENS
// ---------------------------------------------------------------

const PLAYER_COLOR = "#6366f1";
const PLAYER_COLOR_DIM = "rgba(99,102,241,0.15)";
const PLAYER_COLOR_BORDER = "rgba(99,102,241,0.3)";

// Internal Utility -> getAudioUrl()-> Maps session identity to M4A assets
const getAudioUrl = (call) => {
  const rawId = (call.call_id || String(call.id)).replace("#", "");
  return `/useraudio/${rawId}.m4a`;
};

// ---------------------------------------------------------------
// SECTION: LOGIC HELPERS
// ---------------------------------------------------------------

const fmtDur = (secs) => {
  if (!secs && secs !== 0) return "0:00";
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
};

const toPercent = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// ---------------------------------------------------------------
// SECTION: ATOMIC VISUAL MODULES
// ---------------------------------------------------------------

const ProgressMetric = ({ icon, label, pct, count, color }) => (
  <div style={{ marginBottom: 13 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: "#cbd5e1" }}>{icon} {label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>
        {pct}%<span style={{ fontWeight: 400, color: "#64748b", fontSize: 12 }}>{count !== undefined ? ` (${count})` : ""}</span>
      </span>
    </div>
    <div style={{ height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
    </div>
  </div>
);

// ---------------------------------------------------------------
// SECTION: TABULAR DATA MODULES (API SYNC)
// ---------------------------------------------------------------

const CallsTabView = ({ onCallClick }) => {
  // Initialization -> CallsTabView()-> Managed container for call-history telemetry
  const [period, setPeriod] = useState("last_week");
  const [filterPathway, setFilterPathway] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Internal Call -> fetchData: GET /analytics/calls -> Hydrates registry based on period
  useEffect(() => {
    setLoading(true);
    api.get(`/analytics/calls?period=${period}`)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [period]);

  const periodMap = { today: "Today", last_week: "Last week", last_month: "Last month" };

  const chartPoints = data?.chart || [];
  const maxCalls = Math.max(...chartPoints.map(p => p.calls), 1);

  const volumeTrend = (() => {
    if (chartPoints.length < 2) return null;
    const mid = Math.floor(chartPoints.length / 2);
    const avg1 = chartPoints.slice(0, mid).reduce((s, p) => s + p.calls, 0) / Math.max(mid, 1);
    const avg2 = chartPoints.slice(mid).reduce((s, p) => s + p.calls, 0) / Math.max(chartPoints.length - mid, 1);
    return avg1 === 0 ? 0 : Math.round(((avg2 - avg1) / avg1) * 100);
  })();

  const completionPct = (data && data.summary?.total_calls > 0)
    ? toPercent(data.outcomes?.completed ?? 0, data.summary.total_calls)
    : null;
  const health = completionPct === null ? null
    : completionPct >= 70 ? { label: "Performing Well", color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)", icon: "✅", desc: `${completionPct}% of calls completed — your AI is performing well.` }
    : completionPct >= 50 ? { label: "Needs Attention", color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", icon: "⚠", desc: `${completionPct}% completion rate — review your failed calls.` }
    : { label: "Needs Immediate Attention", color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", icon: "✕", desc: `Only ${completionPct}% completion — check your call configuration.` };

  const summaryStats = data ? [
    { label: "TOTAL CALLS", value: data.summary.total_calls, trend: volumeTrend },
    { label: "TOTAL COST", value: `$${data.summary.total_cost.toFixed(2)}`, trend: null },
    { label: "AVG DURATION", value: fmtDur(Math.round(data.summary.avg_duration_seconds)), trend: null },
    { label: "TOTAL TRANSFERS", value: data.summary.total_transfers, trend: null },
    { label: "ISSUES", value: data.summary.total_issues, trend: null },
  ] : Array(5).fill(null).map((_, i) => ({ label: ["TOTAL CALLS", "TOTAL COST", "AVG DURATION", "TOTAL TRANSFERS", "ISSUES"][i], value: "—", trend: null }));

  const calls = data?.calls || [];
  const visibleCols = [
    { key: "recording", label: "RECORDING" }, { key: "callId", label: "CALL ID" },
    { key: "inOut", label: "IN/OUT" }, { key: "to", label: "TO" },
    { key: "from", label: "FROM" }, { key: "duration", label: "DURATION" },
    { key: "issues", label: "ISSUES" }, { key: "created", label: "CREATED" },
    { key: "status", label: "STATUS" }, { key: "pathway", label: "PATHWAY" },
  ];
  const inputBase = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" };

  return (
    <div>
      {health && !loading && (
        <div style={{ background: health.bg, border: `1px solid ${health.border}`, borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 22 }}>{health.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: health.color, marginBottom: 2 }}>{health.label}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{health.desc}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: health.color, lineHeight: 1 }}>{completionPct}%</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>completion rate</div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {Object.entries(periodMap).map(([k, label]) => (
            <button key={k} onClick={() => setPeriod(k)}
              style={{ background: "none", border: "none", borderBottom: period === k ? "2px solid #e2e8f0" : "2px solid transparent", color: period === k ? "#e2e8f0" : "#64748b", padding: "4px 10px", fontSize: 13, fontWeight: period === k ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 10, color: "#64748b", fontSize: 12, pointerEvents: "none" }}>🔍</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search calls…" style={{ ...inputBase, paddingLeft: 30, width: 160 }} />
          </div>
          <select value={filterPathway} onChange={e => setFilterPathway(e.target.value)} style={inputBase}>
            <option value="All">Filter by Pathway</option>
          </select>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "20px 28px", marginBottom: 16 }}>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 18, marginBottom: 18 }}>
          {summaryStats.map((s, i) => (
            <div key={s.label} style={{ flex: 1, borderRight: i < summaryStats.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", paddingRight: i < summaryStats.length - 1 ? 24 : 0, paddingLeft: i > 0 ? 24 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>{loading ? "—" : s.value}</span>
                {!loading && s.trend !== null && s.trend !== undefined && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: s.trend > 0 ? "#22c55e" : s.trend < 0 ? "#ef4444" : "#64748b" }}>
                    {s.trend > 0 ? `↑ ${s.trend}%` : s.trend < 0 ? `↓ ${Math.abs(s.trend)}%` : "→"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Daily Call Volume</span>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#6366f1", display: "inline-block" }} /> Calls</span>
              <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#f59e0b", display: "inline-block" }} /> Peak day</span>
            </div>
          </div>
          {volumeTrend !== null && (
            <span style={{ fontSize: 12, fontWeight: 600, color: volumeTrend > 0 ? "#22c55e" : volumeTrend < 0 ? "#ef4444" : "#64748b", background: volumeTrend > 0 ? "rgba(34,197,94,0.1)" : volumeTrend < 0 ? "rgba(239,68,68,0.1)" : "rgba(100,116,139,0.1)", padding: "3px 10px", borderRadius: 6, border: `1px solid ${volumeTrend > 0 ? "rgba(34,197,94,0.2)" : volumeTrend < 0 ? "rgba(239,68,68,0.2)" : "rgba(100,116,139,0.2)"}` }}>
              {volumeTrend > 0 ? `↑ ${volumeTrend}% up` : volumeTrend < 0 ? `↓ ${Math.abs(volumeTrend)}% down` : "→ Stable"} this period
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: 22, minWidth: 32, alignItems: "flex-end" }}>
            {[maxCalls, Math.round(maxCalls * 0.5), 0].map(v => (
              <span key={v} style={{ fontSize: 10, color: "#475569" }}>{v}</span>
            ))}
          </div>
          <div style={{ flex: 1, display: "flex", gap: 4, height: 140, alignItems: "flex-end" }}>
            {chartPoints.map((p, i) => {
              const barH = Math.max((p.calls / maxCalls) * 120, 4);
              const isPeak = p.calls === maxCalls && maxCalls > 0;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: isPeak ? "#f59e0b" : "#64748b" }}>{p.calls}</span>
                  <div title={`${p.date}: ${p.calls} calls`} style={{ width: "80%", height: barH, background: isPeak ? "linear-gradient(180deg,#f59e0b,#d97706)" : "linear-gradient(180deg,#6366f1,#4f46e5)", borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                  <span style={{ fontSize: 10, color: isPeak ? "#f59e0b" : "#475569", fontWeight: isPeak ? 600 : 400 }}>{p.date}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Call Resolution</div>
            <ProgressMetric icon="✅" label="Completed" pct={toPercent(data.outcomes.completed, data.summary.total_calls)} count={data.outcomes.completed} color="#22c55e" />
            <ProgressMetric icon="📭" label="Voicemail" pct={toPercent(data.outcomes.voicemail, data.summary.total_calls)} count={data.outcomes.voicemail} color="#f59e0b" />
            <ProgressMetric icon="❌" label="Failed" pct={toPercent(data.outcomes.failed, data.summary.total_calls)} count={data.outcomes.failed} color="#ef4444" />
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 2 }}>
              <ProgressMetric icon="↗" label="Transferred" pct={toPercent(data.summary.total_transfers, data.summary.total_calls)} count={data.summary.total_transfers} color="#3b82f6" />
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Call Efficiency</div>
            <ProgressMetric icon="⚡" label="Under 2 min" pct={toPercent(data.duration_dist.under_2min, data.summary.total_calls)} count={data.duration_dist.under_2min} color="#22c55e" />
            <ProgressMetric icon="⏱" label="2 – 5 min" pct={toPercent(data.duration_dist.two_to_5min, data.summary.total_calls)} count={data.duration_dist.two_to_5min} color="#f59e0b" />
            <ProgressMetric icon="🕐" label="Over 5 min" pct={toPercent(data.duration_dist.over_5min, data.summary.total_calls)} count={data.duration_dist.over_5min} color="#6366f1" />
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Avg Duration</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{fmtDur(Math.round(data.summary.avg_duration_seconds))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Total Cost</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>${data.summary.total_cost.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {visibleCols.map(col => (
                  <th key={col.key} style={{ textAlign: "left", padding: "10px 14px", color: "#475569", fontWeight: 600, fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length} style={{ padding: "24px", textAlign: "center", color: "#475569" }}>Loading...</td></tr>
              ) : calls.length === 0 ? (
                <tr><td colSpan={visibleCols.length} style={{ padding: "24px", textAlign: "center", color: "#475569" }}>No calls found for this period.</td></tr>
              ) : (
                calls
                  .filter(c => !searchQuery || (c.call_id || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.to_number || "").includes(searchQuery))
                  .filter(c => filterPathway === "All" || c.pathway === filterPathway)
                  .map((call, i) => (
                    <tr key={call.id} onClick={() => onCallClick(call)}
                      onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}
                      style={{ background: hoveredRow === i ? "rgba(99,102,241,0.06)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.15s" }}>
                      <td style={{ padding: "10px 14px", color: "#475569" }}>
                        {call.duration_seconds > 0
                          ? <button style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, padding: 0 }} onClick={e => e.stopPropagation()}>▶</button>
                          : <span style={{ color: "#334155" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#818cf8", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{(call.call_id || String(call.id)).substring(0, 8)}…</span>
                          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11, padding: 0 }} onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(call.call_id || String(call.id)); }}>⎘</button>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 11, color: call.direction === "inbound" ? "#22c55e" : "#3b82f6" }}>{call.direction === "inbound" ? "↙ In" : "↗ Out"}</span></td>
                      <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{call.to_number || "Web Client"}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{call.from_number || "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 36, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min((call.duration_seconds / 600) * 100, 100)}%`, height: "100%", background: "#6366f1", borderRadius: 2 }} />
                          </div>
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDur(call.duration_seconds)}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{call.issues || "—"}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(call.created_at).toLocaleString()}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: call.status === "completed" ? "#22c55e" : "#94a3b8" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: call.status === "completed" ? "#22c55e" : "#64748b", display: "inline-block" }} />
                          {call.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{call.pathway || "—"}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#475569" }}>{calls.length} calls</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// SECTION: ANALYTICS SUMMARY MODULES
// ---------------------------------------------------------------

const ReportsTabView = () => {
  // Initialization -> ReportsTabView()-> Projects aggregated platform performance trends
  const [period, setPeriod] = useState("last_week");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Internal Call -> api.get(): GET /analytics/reports -> Synchronizes historical trends
  useEffect(() => {
    setLoading(true);
    api.get(`/analytics/reports?period=${period}`)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [period]);

  const periodMap = { today: "Today", last_week: "Last week", last_month: "Last month" };
  const summaryItems = data ? [
    { label: "TOTAL CALLS", value: String(data.total_calls), color: "#8b5cf6" },
    { label: "TOTAL COST", value: `$${data.total_cost.toFixed(2)}`, color: "#10b981" },
    { label: "AVG DURATION", value: fmtDur(Math.round(data.avg_duration_seconds)), color: "#f59e0b" },
    { label: "SUCCESS RATE", value: `${data.success_rate}%`, color: "#3b82f6" },
    { label: "ISSUES", value: String(data.issues), color: "#ef4444" },
  ] : [];
  const chartData = data?.chart || [];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 20 }}>
        {Object.entries(periodMap).map(([k, label]) => (
          <button key={k} onClick={() => setPeriod(k)}
            style={{ background: "none", border: "none", borderBottom: period === k ? "2px solid #e2e8f0" : "2px solid transparent", color: period === k ? "#e2e8f0" : "#64748b", padding: "4px 10px", fontSize: 13, fontWeight: period === k ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 32, marginBottom: 20, flexWrap: "wrap" }}>
          {loading ? <span style={{ color: "#475569" }}>Loading...</span> : summaryItems.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <span style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Calls by Day of Week</span>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>Compare volume across each day in the selected period</div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#22c55e", display: "inline-block" }} /> Calls</span>
            <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#f59e0b", display: "inline-block" }} /> Peak</span>
          </div>
        </div>
        {(() => {
          const maxDay = Math.max(...chartData.map(d => d.calls), 1);
          const dayName = (dateStr) => { try { return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }); } catch { return dateStr; } };
          return (
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: 22, minWidth: 32, alignItems: "flex-end" }}>
                {[maxDay, Math.round(maxDay * 0.5), 0].map(v => (
                  <span key={v} style={{ fontSize: 10, color: "#475569" }}>{v}</span>
                ))}
              </div>
              <div style={{ flex: 1, display: "flex", gap: 6, height: 160, alignItems: "flex-end" }}>
                {chartData.map((d, i) => {
                  const barH = Math.max((d.calls / maxDay) * 130, 4);
                  const isPeak = d.calls === maxDay && maxDay > 1;
                  const day = dayName(d.date);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isPeak ? "#f59e0b" : "#64748b" }}>{d.calls ?? 0}</span>
                      <div title={`${day} (${d.date}): ${d.calls} calls`} style={{ width: "70%", height: barH, background: isPeak ? "linear-gradient(180deg,#f59e0b,#d97706)" : "linear-gradient(180deg,#22c55e,#16a34a)", borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                      <span style={{ fontSize: 10, fontWeight: isPeak ? 700 : 400, color: isPeak ? "#f59e0b" : "#64748b" }}>{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
      {data && (
        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Performance Breakdown</div>
          <ProgressMetric icon="✅" label="Success Rate" pct={data.success_rate ?? 0} color="#22c55e" />
          <ProgressMetric icon="❌" label="Issues Rate" pct={data.total_calls > 0 ? Math.round((data.issues / data.total_calls) * 100) : 0} count={data.issues} color="#ef4444" />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {!loading && [
          ["TOTAL CALLS", String(data?.total_calls ?? 0)],
          ["AVG DURATION", fmtDur(Math.round(data?.avg_duration_seconds ?? 0))],
          ["SUCCESS RATE", `${data?.success_rate ?? 0}%`],
        ].map(([l, v]) => (
          <div key={l} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// SECTION: MAIN PAGE COMPONENT (ORCHESTRATION)
// ---------------------------------------------------------------

const AnalyticsPage = () => {
  // Initialization -> AnalyticsPage()-> Root container for navigation and detail orchestration
  const [activeTab, setActiveTab] = useState("CALLS");
  const [showBookDemo, setShowBookDemo] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState("original");

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });

  const audioRef = useRef(null);
  const progressRef = useRef(null);

  const tabs = ["CALLS", "CITATIONS", "REPORTS"];
  const languages = [
    { code: "original", name: "Original (English)" }, { code: "es", name: "Spanish" },
    { code: "fr", name: "French" }, { code: "de", name: "German" },
    { code: "zh", name: "Chinese" }, { code: "ja", name: "Japanese" },
    { code: "hi", name: "Hindi" }, { code: "ar", name: "Arabic" },
    { code: "pt", name: "Portuguese" }, { code: "ru", name: "Russian" },
  ];

  // Logic Branch -> Translation Engine: Resolves localized text segments for session turns
  const translations = {
    es: { default: [{ speaker: "AI", time: "0:00", text: "¡Hola! Gracias por llamar. Soy su asistente de IA. ¿Cómo puedo ayudarle hoy?" }, { speaker: "Customer", time: "0:08", text: "Hola, necesito ayuda con mi cuenta." }, { speaker: "AI", time: "0:15", text: "Con gusto le ayudo. ¿Podría darme su número de cuenta o correo electrónico?" }] },
    fr: { default: [{ speaker: "AI", time: "0:00", text: "Bonjour ! Merci d'appeler. Je suis votre assistant IA. Comment puis-je vous aider ?" }, { speaker: "Customer", time: "0:08", text: "Bonjour, j'ai besoin d'aide avec mon compte." }, { speaker: "AI", time: "0:15", text: "Bien sûr ! Votre numéro de compte ou votre adresse e-mail, s'il vous plaît ?" }] },
  };

  const formatTime = s => { if (isNaN(s)) return "0:00"; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`; };

  // Internal Utility -> getTranscript(): Merges original transcripts with language-specific offsets
  const getTranscript = (call) => {
    const transcript = call.transcript || [];
    if (selectedLanguage === "original") return transcript;
    const langData = translations[selectedLanguage];
    if (!langData) return transcript;
    return langData[call.call_id] || langData[String(call.id)] || langData.default || transcript;
  };

  const isTranslationAvailable = (call) => {
    if (selectedLanguage === "original") return true;
    const langData = translations[selectedLanguage];
    if (!langData) return false;
    return !!(langData[call.call_id] || langData[String(call.id)] || langData.default);
  };

  // Sub-process -> Audio Listeners: Manages media buffer state and temporal telemetry
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(audio.duration);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [selectedCall]);

  // Logic Branch -> Simulated Playback: Fallback mechanism for sessions lacking active audio nodes
  useEffect(() => {
    let iv;
    if (isPlaying && selectedCall && !audioRef.current?.src) {
      const total = selectedCall.duration_seconds || 0;
      iv = setInterval(() => {
        setCurrentTime(prev => { if (prev >= total) { setIsPlaying(false); return 0; } return prev + 0.1 * playbackRate; });
      }, 100);
    }
    return () => clearInterval(iv);
  }, [isPlaying, selectedCall, playbackRate]);

  useEffect(() => {
    if (selectedCall) {
      setDuration(selectedCall.duration_seconds || 0);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [selectedCall]);

  // Action Trigger -> Audio Controls: Modulates temporal and hardware playback state
  const togglePlay = () => {
    const audio = audioRef.current;
    if (audio?.src) { isPlaying ? audio.pause() : audio.play(); }
    setIsPlaying(p => !p);
  };

  const handleProgressClick = e => {
    const rect = progressRef.current.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * duration;
    setCurrentTime(t);
    if (audioRef.current?.src) audioRef.current.currentTime = t;
  };

  const skipBy = s => {
    const t = Math.max(0, Math.min(currentTime + s, duration));
    setCurrentTime(t);
    if (audioRef.current?.src) audioRef.current.currentTime = t;
  };

  const cycleRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  // Mapping -> Waveform Generation: Projects temporal playback coordinates to visual waveform nodes
  const generateWaveformBars = () => {
    const total = 60, progress = duration > 0 ? currentTime / duration : 0;
    return Array.from({ length: total }, (_, i) => {
      const h = 15 + ((i * 7 + 13) % 100 % 45);
      const played = i / total <= progress;
      return <div key={i} style={{ width: 3, height: h, background: played ? PLAYER_COLOR : "rgba(255,255,255,0.12)", borderRadius: 2, transition: "background 0.3s" }} />;
    });
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (selectedCall) {
    const currentTranscript = getTranscript(selectedCall);
    const translationAvailable = isTranslationAvailable(selectedCall);
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
      <div style={{ background: "#0a0f1a", minHeight: "100vh", padding: 32, color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
        <audio ref={audioRef} src={getAudioUrl(selectedCall)} />

        <button onClick={() => { setSelectedCall(null); setIsPlaying(false); audioRef.current?.pause(); }}
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 24, fontFamily: "inherit" }}>
          ← Back to Analytics
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            Call Details — #{selectedCall.id}
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Download Transcript</button>
            <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Share</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase" }}>Call Information</div>
              {[
                ["Call ID", `#${selectedCall.id}`],
                ["Status", selectedCall.status],
                ["Direction", selectedCall.direction],
                ["To", selectedCall.to_number || "—"],
                ["From", selectedCall.from_number || "—"],
                ["Duration", fmtDur(selectedCall.duration_seconds)],
                ["Cost", `$${parseFloat(selectedCall.cost || 0).toFixed(4)}`],
                ["Pathway", selectedCall.pathway || "—"],
                ["Date", new Date(selectedCall.created_at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase" }}>Call Metrics</div>
              {[
                ["Quality Score", "98%"],
                ["Avg Response", "2.1s"],
                ["Turns", String((selectedCall.transcript || []).length)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${PLAYER_COLOR_BORDER}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>Audio Recording</div>
              </div>

              <div style={{ display: "flex", gap: 3, alignItems: "center", height: 52, marginBottom: 12 }}>
                {generateWaveformBars()}
              </div>

              <div ref={progressRef} onClick={handleProgressClick}
                style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, cursor: "pointer", marginBottom: 10 }}>
                <div style={{ width: `${progressPercent}%`, height: "100%", background: PLAYER_COLOR, borderRadius: 2, transition: "width 0.1s" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{formatTime(currentTime)}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={() => skipBy(-10)}
                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>⏪</button>
                  <button onClick={togglePlay}
                    style={{ background: PLAYER_COLOR, border: "none", color: "#fff", width: 42, height: 42, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.4s", boxShadow: `0 0 18px ${PLAYER_COLOR_DIM}` }}>
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => skipBy(10)}
                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>⏩</button>
                </div>
                <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{formatTime(duration)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button onClick={cycleRate} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{playbackRate}x</button>
                <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>⬇️ Download</button>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>Transcript</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Translate to:</span>
                  <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, outline: "none", fontFamily: "inherit" }}>
                    {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              {selectedLanguage !== "original" && !translationAvailable && (
                <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: "#f59e0b" }}>
                  ⚠️ Translation not available for this call. Showing original.
                </div>
              )}

              <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                {currentTranscript.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#475569", fontSize: 13, padding: 20 }}>No transcript available for this call.</div>
                ) : (
                  currentTranscript.map((msg, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.speaker === "AI" ? "rgba(139,92,246,0.15)" : PLAYER_COLOR_DIM, border: `1px solid ${msg.speaker === "AI" ? "rgba(139,92,246,0.3)" : PLAYER_COLOR_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>
                        {msg.speaker === "AI" ? "🤖" : "👤"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: msg.speaker === "AI" ? "#8b5cf6" : PLAYER_COLOR }}>
                            {msg.speaker === "AI" ? "AI Assistant" : "Customer"}
                          </span>
                          <span style={{ fontSize: 10, color: "#475569" }}>{msg.time}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{msg.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => { navigator.clipboard.writeText(currentTranscript.map(m => `${m.speaker}: ${m.text}`).join("\n")); alert("Copied!"); }}
                  style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>📋 Copy Text</button>
                <button style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>📄 Export PDF</button>
                <button style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>📊 Add to Report</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showBookDemo) {
    return (
      <div style={{ background: "#0a0f1a", minHeight: "100vh", display: "flex", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", position: "relative" }}>
        <div style={{ flex: 1, background: "linear-gradient(135deg,#1e1b4b 0%,#0a0f1a 100%)", padding: 60, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>SR Comsoft</div>
          <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: "#f1f5f9" }}>Scale your voice operations with AI</h1>
          <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, marginBottom: 32 }}>Join leading enterprises using our platform to handle millions of customer interactions.</p>
          {["Enterprise SLAs", "Custom voices", "24/7 Support"].map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ color: "#10b981", fontSize: 16 }}>✓</span>
              <span style={{ color: "#94a3b8", fontSize: 14 }}>{f}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 60, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <button onClick={() => setShowBookDemo(false)} style={{ position: "absolute", top: 30, right: 30, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>← Back</button>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Book a Demo</h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 28 }}>See how Citations and Enterprise features can transform your call data.</p>
          {[["Name", "name", "text", "Your full name"], ["Work Email", "email", "email", "you@company.com"], ["Phone Number", "phone", "tel", "+1 555 0000"]].map(([label, field, type, ph]) => (
            <div key={field} style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6 }}>{label}</label>
              <input type={type} placeholder={ph} value={formData[field]} onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
          ))}
          <button onClick={() => { alert("Thank you! We'll contact you shortly."); setShowBookDemo(false); }}
            style={{ width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: 14, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Request Demo →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0f1a", minHeight: "100vh", padding: "28px 32px", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Analytics</h1>
        <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Export Data</button>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 24 }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#8b5cf6" : "transparent"}`, color: activeTab === tab ? "#fff" : "#64748b", padding: "12px 20px", fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, cursor: "pointer", transition: "all 0.2s", marginBottom: -1, textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "inherit" }}>
            {tab}
            {tab === "CITATIONS" && <span style={{ marginLeft: 6, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, verticalAlign: "middle" }}>PRO</span>}
          </button>
        ))}
      </div>

      {activeTab === "CALLS" && (
        <CallsTabView onCallClick={call => {
          setSelectedCall({ ...call, transcript: call.transcript || [] });
        }} />
      )}

      {activeTab === "REPORTS" && <ReportsTabView />}

      {activeTab === "CITATIONS" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Citations are an Enterprise feature</h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24, maxWidth: 400 }}>Citation Schemas enable automated insight extraction from your calls.</p>
          <button onClick={() => setShowBookDemo(true)} style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Contact Sales →</button>
        </div>
      )}

      {activeTab !== "CITATIONS" && (
        <div style={{ marginTop: 24, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}><strong style={{ color: "#a78bfa" }}>Advanced Analytics</strong> available for Enterprise plans</span>
          <button onClick={() => setShowBookDemo(true)} style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Upgrade to Enterprise</button>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
