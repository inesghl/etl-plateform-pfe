/**
 * ScheduleEditor.tsx
 *
 * Admins can:
 *   - Create / Edit / Delete a schedule
 *   - Pause / Resume   (⏸ / ▶)
 *   - Fire Now         (⚡ Now)
 *
 * Regular users can ONLY:
 *   - View the schedule (read-only summary)
 *   - Fire Now         (⚡ Now) — creates a PENDING execution for themselves only
 *
 * Nothing a user does touches the schedule record itself.
 */
import React, { useEffect, useState } from "react";
import {
  ETLSchedule, SchedulePayload,
  fetchScheduleForEtl, createSchedule, updateSchedule,
  deleteSchedule, toggleSchedule, fireScheduleNow,
} from "../../api/scheduling";

type Props = {
  etlId: string;
  etlName: string;
  userEmail: string;
  isAdmin: boolean;
};

const DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const S = {
  wrap: {
    marginTop: 12,
    padding: "14px 16px",
    borderRadius: 10,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    fontSize: 13,
  } as React.CSSProperties,

  row: { display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,

  label: {
    fontSize: 11,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: ".05em",
    marginBottom: 4,
  },

  hint: { fontSize: 11, color: "#94a3b8", marginTop: 4 },

  input: {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    outline: "none",
    background: "#fff",
    color: "#0f172a",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  select: {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    outline: "none",
    background: "#fff",
    color: "#0f172a",
    cursor: "pointer",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  btn: (v: "primary" | "danger" | "ghost" | "green" | "orange") =>
    ({
      padding: "7px 14px",
      borderRadius: 7,
      border: "none",
      cursor: "pointer",
      fontWeight: 600,
      fontSize: 12,
      background:
        v === "primary" ? "#2563eb"
        : v === "danger"  ? "#dc2626"
        : v === "green"   ? "#16a34a"
        : v === "orange"  ? "#d97706"
        : "#f1f5f9",
      color: v === "ghost" ? "#64748b" : "#fff",
    } as React.CSSProperties),

  divider: { margin: "12px 0", borderTop: "1px solid #e2e8f0" } as React.CSSProperties,
  section: { marginBottom: 14 } as React.CSSProperties,
  twoCol:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as React.CSSProperties,

  badge: (active: boolean) =>
    ({
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      background: active ? "#dcfce7" : "#fee2e2",
      color: active ? "#15803d" : "#b91c1c",
    } as React.CSSProperties),
};

function freqLabel(s: ETLSchedule): string {
  if (s.frequency === "weekly")  return `Weekly (${DAYS[s.day_of_week ?? 0]})`;
  if (s.frequency === "monthly") return `Monthly (day ${s.day_of_month})`;
  if (s.frequency === "yearly")
    return `Yearly (${MONTHS[(s.month_of_year ?? 1) - 1]} ${s.day_of_month})`;
  return "Daily";
}

export function ScheduleEditor({ etlId, etlName, userEmail, isAdmin }: Props) {
  const [schedule, setSchedule] = useState<ETLSchedule | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [firing,   setFiring]   = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error,    setError]    = useState("");

  // Form state (admin edit form only)
  const [freq,          setFreq]          = useState<ETLSchedule["frequency"]>("daily");
  const [time,          setTime]          = useState("08:00");
  const [dow,           setDow]           = useState(0);
  const [dom,           setDom]           = useState(1);
  const [moy,           setMoy]           = useState(1);
  const [backupEmail,   setBackupEmail]   = useState("");
  const [notifyTarget,  setNotifyTarget]  = useState<"creator" | "group" | "specific">("creator");
  const [specificEmail, setSpecificEmail] = useState("");

  useEffect(() => {
    fetchScheduleForEtl(etlId)
      .then(s => { setSchedule(s); if (s) populate(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etlId]);

  function populate(s: ETLSchedule) {
    setFreq(s.frequency);
    setTime(s.time_of_day.slice(0, 5));
    setDow(s.day_of_week ?? 0);
    setDom(s.day_of_month ?? 1);
    setMoy(s.month_of_year ?? 1);
    setBackupEmail(s.backup_email ?? "");
    setNotifyTarget((s.notify_target as any) ?? "creator");
    setSpecificEmail(s.notify_specific_email ?? "");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload: SchedulePayload = {
        etl:           etlId,
        frequency:     freq,
        time_of_day:   time,
        day_of_week:   freq === "weekly"                    ? dow : null,
        day_of_month:  ["monthly", "yearly"].includes(freq) ? dom : null,
        month_of_year: freq === "yearly"                    ? moy : null,
        backup_email:  backupEmail || undefined,
        notify_target:         notifyTarget,
        notify_specific_email: notifyTarget === "specific" ? specificEmail : "",
      };
      const saved = schedule
        ? await updateSchedule(schedule.id, payload)
        : await createSchedule(payload);
      setSchedule(saved);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!schedule || !confirm(`Delete schedule for "${etlName}"?`)) return;
    await deleteSchedule(schedule.id);
    setSchedule(null);
    setEditing(false);
  }

  async function handleToggle() {
    if (!schedule || toggling) return;
    setToggling(true);
    try {
      setSchedule(await toggleSchedule(schedule.id));
    } finally {
      setToggling(false);
    }
  }

  async function handleFireNow() {
    if (!schedule || firing) return;
    setFiring(true);
    try {
      const r = await fireScheduleNow(schedule.id);
      alert(
        `✅ Execution created!\nGo to the Executions tab to review and launch it.\n\nID: ${r.execution_id}`,
      );
    } catch (e: any) {
      alert(`❌ Could not trigger execution.\n${e?.message ?? ""}`);
    } finally {
      setFiring(false);
    }
  }

  if (loading) {
    return <div style={{ ...S.wrap, color: "#94a3b8" }}>Loading schedule…</div>;
  }

  // ── No schedule yet ───────────────────────────────────────────────────────
  if (!schedule && !editing) {
    // Regular users just see a message — they can't create schedules
    if (!isAdmin) {
      return (
        <div style={{ ...S.wrap, color: "#94a3b8" }}>
          No schedule configured for this ETL.
        </div>
      );
    }
    return (
      <div style={S.wrap}>
        <div style={{ ...S.row, justifyContent: "space-between" }}>
          <span style={{ color: "#94a3b8" }}>No schedule set</span>
          <button style={S.btn("primary")} onClick={() => setEditing(true)}>
            + Add Schedule
          </button>
        </div>
      </div>
    );
  }

  // ── Summary view (shown to everyone, actions differ by role) ─────────────
  if (schedule && !editing) {
    return (
      <div style={S.wrap}>
        <div style={{ ...S.row, justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={S.badge(schedule.is_active)}>
              {schedule.is_active ? "Active" : "Paused"}
            </span>
            <span style={{ marginLeft: 8, color: "#475569", fontWeight: 600 }}>
              {freqLabel(schedule)} at {schedule.time_of_day.slice(0, 5)}
            </span>
          </div>

          <div style={S.row}>
            {/* Pause / Resume — admin only */}
            {isAdmin && (
              <button
                style={S.btn("orange")}
                onClick={handleToggle}
                disabled={toggling}
                title={schedule.is_active ? "Pause this schedule" : "Resume this schedule"}
              >
                {toggling ? "…" : schedule.is_active ? "⏸ Pause" : "▶ Resume"}
              </button>
            )}

            {/* Fire Now — all users */}
            <button
              style={S.btn("green")}
              onClick={handleFireNow}
              disabled={firing}
              title="Create a pending execution right now — review and launch it in the Executions tab"
            >
              {firing ? "…" : "⚡ Now"}
            </button>

            {/* Edit — admin only */}
            {isAdmin && (
              <button
                style={S.btn("ghost")}
                onClick={() => { populate(schedule); setEditing(true); }}
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Notification info — admin only (users don't need to see this) */}
        {isAdmin && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            📧{" "}
            {schedule.notify_target === "group"
              ? "Notifying entire group"
              : schedule.notify_target === "specific" && schedule.notify_specific_email
                ? `Notifying: ${schedule.notify_specific_email}`
                : `Notifying: ${schedule.effective_email}`}
            {schedule.backup_email && (
              <span style={{ color: "#94a3b8" }}> + CC: {schedule.backup_email}</span>
            )}
          </div>
        )}

        {schedule.last_triggered_at && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
            Last triggered: {new Date(schedule.last_triggered_at).toLocaleString()}
          </div>
        )}
      </div>
    );
  }

  // ── Edit / Create form — admin only ──────────────────────────────────────
  // (Regular users never reach this branch because the Edit button is hidden)
  return (
    <div style={S.wrap}>
      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>
        {schedule ? "Edit Schedule" : "New Schedule"} — {etlName}
      </div>

      <div style={S.twoCol}>
        <div style={S.section}>
          <div style={S.label}>Frequency</div>
          <select
            style={S.select}
            value={freq}
            onChange={e => setFreq(e.target.value as ETLSchedule["frequency"])}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div style={S.section}>
          <div style={S.label}>Time (server local)</div>
          <input
            type="time"
            style={S.input}
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </div>
      </div>

      {freq === "weekly" && (
        <div style={S.section}>
          <div style={S.label}>Day of week</div>
          <select
            style={S.select}
            value={dow}
            onChange={e => setDow(Number(e.target.value))}
          >
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}

      {freq === "monthly" && (
        <div style={S.section}>
          <div style={S.label}>Day of month (1–31)</div>
          <input
            type="number" min={1} max={31}
            style={S.input}
            value={dom}
            onChange={e => setDom(Math.min(31, Math.max(1, Number(e.target.value))))}
          />
          <div style={S.hint}>
            {dom === 28
              ? "✓ Safe for all months including February."
              : dom > 28
                ? "Days 29–31 clamp to last day of shorter months."
                : `Fires on day ${dom} of every month.`}
          </div>
        </div>
      )}

      {freq === "yearly" && (
        <div style={S.twoCol}>
          <div style={S.section}>
            <div style={S.label}>Month</div>
            <select
              style={S.select}
              value={moy}
              onChange={e => setMoy(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={S.section}>
            <div style={S.label}>Day</div>
            <input
              type="number" min={1} max={31}
              style={S.input}
              value={dom}
              onChange={e => setDom(Math.min(31, Math.max(1, Number(e.target.value))))}
            />
            {moy === 2 && dom > 28 && (
              <div style={{ ...S.hint, color: "#d97706" }}>
                February max is 28 — will fire on Feb 28.
              </div>
            )}
          </div>
        </div>
      )}

      <hr style={S.divider} />

      {/* Notify target — admin only (always shown here since only admins reach this form) */}
      <div style={S.section}>
        <div style={S.label}>Notify</div>
        <select
          style={S.select}
          value={notifyTarget}
          onChange={e => setNotifyTarget(e.target.value as any)}
        >
          <option value="creator">ETL creator only</option>
          <option value="group">Entire group</option>
          <option value="specific">Specific email</option>
        </select>
      </div>

      {notifyTarget === "specific" && (
        <div style={S.section}>
          <div style={S.label}>Specific email</div>
          <input
            type="email"
            style={S.input}
            placeholder="user@example.com"
            value={specificEmail}
            onChange={e => setSpecificEmail(e.target.value)}
          />
        </div>
      )}

      <div style={S.section}>
        <div style={S.label}>Backup / CC email (optional)</div>
        <input
          type="email"
          style={S.input}
          placeholder={userEmail ? `e.g. ${userEmail}` : "backup@example.com"}
          value={backupEmail}
          onChange={e => setBackupEmail(e.target.value)}
        />
        <div style={S.hint}>Always receives a copy of the notification email.</div>
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 7,
          background: "#fef2f2", color: "#dc2626", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <div>
          {schedule && (
            <button style={S.btn("danger")} onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
        <div style={S.row}>
          <button style={S.btn("ghost")} disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button style={S.btn("primary")} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}