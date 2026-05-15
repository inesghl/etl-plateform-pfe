// src/components/stats/StatsPanel.tsx
import React, { useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useStats } from "../../hooks/useStats";
import { StatsRange, TopETL, TopUser, FileTypeStat, RecentFailure } from "../../api/stats";

// ── constants ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:           "#16a34a",
  FAILED:            "#dc2626",
  RUNNING:           "#d97706",
  PENDING:           "#94a3b8",
  VALIDATED:         "#2563eb",
  INSTALLING_DEPS:   "#7c3aed",
  CANCELLED:         "#cbd5e1",
  VALIDATION_FAILED: "#ea580c",
};

const FILE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#94a3b8", "#7c3aed"];

const RANGES: { label: string; value: StatsRange }[] = [
  { label: "7 days",  value: "7d"  },
  { label: "30 days", value: "30d" },
  { label: "All time",value: "all" },
];

// ── helpers ───────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── small reusable pieces ─────────────────────────────────────────────────

function KpiCard({ label, value, sub, valueColor }: {
  label: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div style={{
      background: "#f8fafc",
      border: "1px solid #f1f5f9",
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 3,
    }}>
      <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 700, color: valueColor ?? "#0f172a", lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: "#94a3b8" }}>{sub}</span>}
    </div>
  );
}

function SectionBox({ title, children, flex }: {
  title: string; children: React.ReactNode; flex?: number;
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #f1f5f9",
      borderRadius: 10,
      padding: "16px 18px",
      flex: flex ?? 1,
      minWidth: 0,
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

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 5, borderRadius: 3, background: "#f1f5f9", overflow: "hidden", width: 70 }}>
      <div style={{ height: "100%", borderRadius: 3, background: color, width: `${pct}%`, transition: "width .4s" }} />
    </div>
  );
}

function RateBadge({ rate }: { rate: number }) {
  const ok = rate >= 90;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
      background: ok ? "#f0fdf4" : "#fef2f2",
      color: ok ? "#15803d" : "#b91c1c",
      border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
    }}>
      {rate.toFixed(1)}%
    </span>
  );
}

// ── sub-tables ────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  textAlign: "left", fontSize: 11, fontWeight: 600, color: "#94a3b8",
  padding: "0 8px 8px", borderBottom: "1px solid #f1f5f9",
  textTransform: "uppercase", letterSpacing: "0.04em",
};
const TD: React.CSSProperties = {
  padding: "8px 8px", borderBottom: "1px solid #f8fafc",
  fontSize: 13, color: "#0f172a", verticalAlign: "middle",
};

function TopEtlsTable({ rows }: { rows: TopETL[] }) {
  const max = rows[0]?.runs ?? 1;
  return (
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
        {rows.map(e => (
          <tr key={e.etl__id}>
            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={e.etl__name}>{e.etl__name}</td>
            <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>{e.runs}</td>
            <td style={TD}><RateBadge rate={e.success_rate} /></td>
            <td style={TD}><MiniBar value={e.runs} max={max} color="#2563eb" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopUsersTable({ rows }: { rows: TopUser[] }) {
  const max = rows[0]?.runs ?? 1;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={TH}>User</th>
          <th style={{ ...TH, textAlign: "right" }}>Runs</th>
          <th style={TH}>Rate</th>
          <th style={TH} />
        </tr>
      </thead>
      <tbody>
        {rows.map(u => (
          <tr key={u.launched_by__id}>
            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={u.launched_by__email}>
              {u.launched_by__first_name
                ? `${u.launched_by__first_name} ${u.launched_by__last_name}`
                : u.launched_by__email}
            </td>
            <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>{u.runs}</td>
            <td style={TD}><RateBadge rate={u.success_rate} /></td>
            <td style={TD}><MiniBar value={u.runs} max={max} color="#16a34a" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FailuresTable({ rows }: { rows: RecentFailure[] }) {
  if (!rows.length) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem 0", fontSize: 13, color: "#94a3b8" }}>
        No failures in this period 🎉
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={TH}>ETL</th>
          <th style={TH}>User</th>
          <th style={TH}>When</th>
          <th style={TH}>Error</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(f => (
          <tr key={f.id}>
            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12 }}>{f.etl__name}</td>
            <td style={{ ...TD, color: "#64748b", fontSize: 12 }}>{f.launched_by__email}</td>
            <td style={{ ...TD, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(f.launched_at)}</td>
            <td style={{ ...TD, fontFamily: "monospace", fontSize: 11, color: "#b91c1c", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={f.error_snippet}>{f.error_snippet || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FileTypesChart({ rows }: { rows: FileTypeStat[] }) {
  // @ts-ignore
    return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart layout="vertical" data={rows} margin={{ top: 0, right: 12, left: 4, bottom: 0 }} barSize={12}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="file_type" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} width={44} />
        <Tooltip
formatter={(value, name) => [Number(value ?? 0), name]}
contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f1f5f9" }}
        />
        <Bar dataKey="count" name="Files" radius={[0, 3, 3, 0]}>
          {rows.map((_, i) => <Cell key={i} fill={FILE_COLORS[i % FILE_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── main component ────────────────────────────────────────────────────────

export function StatsPanel() {
  const { data, loading, error, range, loadStats, changeRange } = useStats();

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3rem", justifyContent: "center", color: "#64748b", fontSize: 14 }}>
      <span style={{
        width: 18, height: 18, border: "2px solid #e2e8f0", borderTopColor: "#0f172a",
        borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block",
      }} />
      Loading stats…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: "2rem", textAlign: "center", color: "#b91c1c", fontSize: 13 }}>
      {error}{" "}
      <button
        onClick={() => loadStats()}
        style={{ marginLeft: 8, fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
      >
        retry
      </button>
    </div>
  );

  if (!data) return null;

  const { kpis, status_distribution, timeline, top_etls, top_users, file_types, etl_health, recent_failures } = data;

  const tl = timeline.map(r => ({
    ...r,
    label: new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  // @ts-ignore
    return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Platform overview</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Real-time aggregates across all ETLs</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => changeRange(r.value)}
              style={{
                fontSize: 12, padding: "5px 13px", borderRadius: 7, cursor: "pointer",
                border: `1px solid ${range === r.value ? "#0f172a" : "#e2e8f0"}`,
                background: range === r.value ? "#0f172a" : "#fff",
                color: range === r.value ? "#fff" : "#64748b",
                fontWeight: range === r.value ? 600 : 400,
                transition: "all .15s",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiCard label="Total executions" value={kpis.total_executions.toLocaleString()} />
        <KpiCard
          label="Success rate"
          value={`${kpis.success_rate}%`}
          valueColor={kpis.success_rate >= 90 ? "#15803d" : "#b91c1c"}
          sub={kpis.success_rate >= 90 ? "healthy" : "needs attention"}
        />
        <KpiCard label="Avg duration" value={fmtDuration(kpis.avg_duration_seconds)} sub="per execution" />
        <KpiCard
          label="Output files"
          value={kpis.output_files_count.toLocaleString()}
          sub={`${kpis.output_files_size_mb} MB total`}
        />
      </div>

      {/* timeline + donut */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <SectionBox title="Executions over time" flex={2}>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={tl} barSize={11} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f1f5f9" }} />
              <Bar dataKey="success" stackId="a" fill="#16a34a" name="Success" />
              <Bar dataKey="failed"  stackId="a" fill="#dc2626" name="Failed" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionBox>

        <SectionBox title="Status breakdown" flex={1}>
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
        </SectionBox>
      </div>

      {/* top ETLs + top users */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <SectionBox title="Top ETLs by runs" flex={2}>
          <TopEtlsTable rows={top_etls} />
        </SectionBox>
        <SectionBox title="Top users" flex={1}>
          <TopUsersTable rows={top_users} />
        </SectionBox>
      </div>

      {/* ETL health + file types */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <SectionBox title="ETL health (global)" flex={1}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(85px, 1fr))", gap: 8 }}>
            {[
              { label: "Total ETLs",       value: etl_health.total },
              { label: "Active",           value: etl_health.active },
              { label: "Validated",        value: etl_health.validated },
              { label: "Group-restricted", value: etl_health.with_groups },
              { label: "Schedules on",     value: etl_health.active_schedules },
            ].map(h => (
              <div key={h.label} style={{
                background: "#f8fafc", borderRadius: 8, padding: "10px 12px",
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>{h.value}</span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>{h.label}</span>
              </div>
            ))}
          </div>
        </SectionBox>

        <SectionBox title="Output files by type" flex={1}>
          <FileTypesChart rows={file_types} />
        </SectionBox>
      </div>

      {/* recent failures */}
      <SectionBox title="Recent failures">
        <FailuresTable rows={recent_failures} />
      </SectionBox>

    </div>
  );
}