// src/components/stats/UserStatsPanel.tsx
// Personal dashboard — shown to regular users. Scoped to their own executions.

import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { fetchUserStats, UserStatsData, StatsRange } from "../../api/stats";
import { User } from "../../types/user";

// ── design tokens ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:           "#16a34a",
  FAILED:            "#dc2626",
  RUNNING:           "#d97706",
  PENDING:           "#94a3b8",
  VALIDATED:         "#16a34a",
  INSTALLING_DEPS:   "#7c3aed",
  CANCELLED:         "#cbd5e1",
  VALIDATION_FAILED: "#ea580c",
};

const FILE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#94a3b8", "#7c3aed"];

const RANGES: { label: string; value: StatsRange }[] = [
  { label: "7 days",   value: "7d"  },
  { label: "30 days",  value: "30d" },
  { label: "All time", value: "all" },
];

// ── helpers ───────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── small reusable UI pieces ──────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, valueColor, accent }: {
  icon: string; label: string; value: string;
  sub?: string; valueColor?: string; accent?: string;
}) {
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${accent ? accent + "33" : "#f1f5f9"}`,
      borderTop: `3px solid ${accent ?? "#e2e8f0"}`,
      borderRadius: 10,
      padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
        {label}
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: valueColor ?? "#0f172a", lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: "#94a3b8" }}>{sub}</span>}
    </div>
  );
}

function Section({ title, children, flex }: {
  title: string; children: React.ReactNode; flex?: number;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #f1f5f9",
      borderRadius: 10, padding: "16px 18px",
      flex: flex ?? 1, minWidth: 0,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#94a3b8",
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: "left", fontSize: 11, fontWeight: 600, color: "#94a3b8",
  padding: "0 8px 8px", borderBottom: "1px solid #f1f5f9",
  textTransform: "uppercase", letterSpacing: "0.04em",
};
const TD: React.CSSProperties = {
  padding: "8px", borderBottom: "1px solid #f8fafc",
  fontSize: 13, color: "#0f172a", verticalAlign: "middle",
};

function RateBadge({ rate }: { rate: number }) {
  const ok = rate >= 80;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
      background: ok ? "#f0fdf4" : "#fef2f2",
      color: ok ? "#15803d" : "#b91c1c",
      border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
    }}>
      {rate.toFixed(0)}%
    </span>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 5, borderRadius: 3, background: "#f1f5f9", width: 60, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 3, background: color, width: `${pct}%` }} />
    </div>
  );
}

// ── status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#94a3b8";
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: color + "18", color,
      border: `1px solid ${color}44`,
    }}>
      {status}
    </span>
  );
}

// ── empty state ───────────────────────────────────────────────────────────

function Empty({ message }: { message: string }) {
  return (
    <div style={{
      textAlign: "center", padding: "2rem 0",
      fontSize: 13, color: "#94a3b8",
    }}>
      {message}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

interface Props { currentUser: User; }

export function UserStatsPanel({ currentUser }: Props) {
  const [data,    setData]    = useState<UserStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [range,   setRange]   = useState<StatsRange>("30d");

  const load = useCallback(async (r: StatsRange) => {
    try {
      setLoading(true); setError(null);
      setData(await fetchUserStats(r));
    } catch (e: any) {
      setError(e.message ?? "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [load]);

  function changeRange(r: StatsRange) { setRange(r); load(r); }

  // ── loading ───────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3rem", justifyContent: "center", color: "#64748b", fontSize: 14 }}>
      <span style={{
        width: 18, height: 18, border: "2px solid #e2e8f0", borderTopColor: "#2563eb",
        borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block",
      }} />
      Loading your stats…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: "2rem", textAlign: "center", color: "#b91c1c", fontSize: 13 }}>
      {error}{" "}
      <button onClick={() => load(range)} style={{ marginLeft: 8, fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
        retry
      </button>
    </div>
  );

  if (!data) return null;

  const { kpis, status_distribution, timeline, top_etls, file_types, recent_failures, last_execution } = data;
  const displayName = currentUser.first_name
    ? `${currentUser.first_name} ${currentUser.last_name}`.trim()
    : currentUser.username;

  const tl = timeline.map(r => ({
    ...r,
    label: new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  const maxRuns = top_etls[0]?.runs ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            Welcome back, {displayName} 👋
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Your personal execution stats
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map(r => (
            <button key={r.value} onClick={() => changeRange(r.value)} style={{
              fontSize: 12, padding: "5px 13px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${range === r.value ? "#2563eb" : "#e2e8f0"}`,
              background: range === r.value ? "#2563eb" : "#fff",
              color: range === r.value ? "#fff" : "#64748b",
              fontWeight: range === r.value ? 600 : 400,
              transition: "all .15s",
            }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── last run banner ─────────────────────────────────────────────── */}
      {last_execution && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: last_execution.status === "SUCCESS" ? "#f0fdf4" : last_execution.status === "FAILED" ? "#fef2f2" : "#eff6ff",
          border: `1px solid ${last_execution.status === "SUCCESS" ? "#bbf7d0" : last_execution.status === "FAILED" ? "#fecaca" : "#93c5fd"}`,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 20 }}>
            {last_execution.status === "SUCCESS" ? "✅" : last_execution.status === "FAILED" ? "❌" : "⏳"}
          </span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
              Last run: {last_execution.etl__name}
            </span>
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 10 }}>
              {timeAgo(last_execution.launched_at)}
            </span>
          </div>
          <StatusBadge status={last_execution.status} />
        </div>
      )}

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <KpiCard
          icon="▶"
          label="Total runs"
          value={kpis.total_executions.toLocaleString()}
          accent="#2563eb"
        />
        <KpiCard
          icon="✓"
          label="Success rate"
          value={`${kpis.success_rate}%`}
          valueColor={kpis.success_rate >= 80 ? "#15803d" : "#b91c1c"}
          sub={kpis.success_rate >= 80 ? "great work" : "needs attention"}
          accent={kpis.success_rate >= 80 ? "#16a34a" : "#dc2626"}
        />
        <KpiCard
          icon="⏱"
          label="Avg duration"
          value={fmtDuration(kpis.avg_duration_seconds)}
          sub="per execution"
          accent="#7c3aed"
        />
        <KpiCard
          icon="📄"
          label="Output files"
          value={kpis.output_files_count.toLocaleString()}
          sub={`${kpis.output_files_size_mb} MB`}
          accent="#d97706"
        />
      </div>

      {/* ── no data at all ────────────────────────────────────────────────── */}
      {kpis.total_executions === 0 && (
        <div style={{
          padding: "32px 24px", borderRadius: 10,
          background: "#f8fafc", border: "1px solid #e2e8f0",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🚀</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>
            No executions yet
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Launch your first ETL from the ETLs tab to see your stats here.
          </div>
        </div>
      )}

      {kpis.total_executions > 0 && (
        <>
          {/* ── timeline + donut ──────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Section title="My executions over time" flex={2}>
              {tl.length === 0 ? (
                <Empty message="No data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={tl} barSize={12} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f1f5f9" }} />
                    <Bar dataKey="success" stackId="a" fill="#16a34a" name="Success" />
                    <Bar dataKey="failed"  stackId="a" fill="#dc2626" name="Failed" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>

            <Section title="Status breakdown" flex={1}>
              {status_distribution.length === 0 ? (
                <Empty message="No data." />
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={status_distribution} dataKey="count" nameKey="status"
                      cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}
                    >
                      {status_distribution.map(s => (
                        <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Legend iconSize={9} iconType="square"
                      formatter={(v) => <span style={{ fontSize: 11, color: "#64748b" }}>{v}</span>} />
                    <Tooltip
                      formatter={(v, name) => [v ?? 0, name]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f1f5f9" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Section>
          </div>

          {/* ── ETLs I ran + output file types ────────────────────────────── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>

            {/* ETLs I ran most */}
            <Section title="ETLs I ran most" flex={2}>
              {top_etls.length === 0 ? (
                <Empty message="No ETL runs in this period." />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>ETL</th>
                      <th style={{ ...TH, textAlign: "right" }}>Runs</th>
                      <th style={TH}>Rate</th>
                      <th style={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {top_etls.map(e => (
                      <tr key={e.etl__id}>
                        <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={e.etl__name}>
                          {e.etl__name}
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>{e.runs}</td>
                        <td style={TD}><RateBadge rate={e.success_rate} /></td>
                        <td style={TD}><MiniBar value={e.runs} max={maxRuns} color="#2563eb" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Output files by type */}
            <Section title="My output files by type" flex={1}>
              {file_types.length === 0 ? (
                <Empty message="No output files yet." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  {file_types.map((f, i) => (
                    <div key={f.file_type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                        background: FILE_COLORS[i % FILE_COLORS.length],
                      }} />
                      <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace", width: 50 }}>
                        {f.file_type}
                      </span>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: "#f1f5f9", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 4,
                          background: FILE_COLORS[i % FILE_COLORS.length],
                          width: `${Math.round((f.count / (file_types[0]?.count ?? 1)) * 100)}%`,
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>
                        {f.count} file{f.count !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
                        {f.size_mb} MB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* ── my recent failures ────────────────────────────────────────── */}
          <Section title="My recent failures">
            {recent_failures.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0", fontSize: 13, color: "#94a3b8" }}>
                No failures in this period 🎉
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>ETL</th>
                    <th style={TH}>When</th>
                    <th style={TH}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recent_failures.map(f => (
                    <tr key={f.id}>
                      <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>
                        {f.etl__name}
                      </td>
                      <td style={{ ...TD, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                        {fmtDate(f.launched_at)}
                      </td>
                      <td style={{
                        ...TD, fontFamily: "monospace", fontSize: 11, color: "#b91c1c",
                        maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }} title={f.error_snippet}>
                        {f.error_snippet || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}