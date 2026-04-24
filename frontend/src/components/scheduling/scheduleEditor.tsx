/**
 * ScheduleEditor.tsx
 * ──────────────────
 * Inline schedule editor inside the ETL card.
 * - Both users AND admins can create/edit/delete schedules.
 * - Admins get extra "Notification target" options (group / specific email).
 * - All users can set a backup email.
 * - Admins see a "Fire Now" button to trigger immediately.
 */
import React, { useEffect, useState } from "react";
import {
  ETLSchedule,
  SchedulePayload,
  fetchScheduleForEtl,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  toggleSchedule,
} from "../../api/scheduling";

// ── types ────────────────────────────────────────────────────────────────────
type Props = {
  etlId: string;
  etlName: string;
  userEmail: string;
  isAdmin: boolean;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const S = {
  wrap: {
    marginTop: 12,
    padding: "14px 16px",
    borderRadius: 10,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    fontSize: 13,
  } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  label: { fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4 },
  input: {
    width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #e2e8f0",
    fontSize: 13, outline: "none", background: "#fff", color: "#0f172a",
  } as React.CSSProperties,
  select: {
    width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #e2e8f0",
    fontSize: 13, outline: "none", background: "#fff", color: "#0f172a", cursor: "pointer",
  } as React.CSSProperties,
  btn: (variant: "primary" | "danger" | "ghost" | "green") => ({
    padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600,
    fontSize: 12, transition: "opacity .15s",
    background: variant === "primary" ? "#2563eb" : variant === "danger" ? "#dc2626" : variant === "green" ? "#16a34a" : "#f1f5f9",
    color: variant === "ghost" ? "#64748b" : "#fff",
  } as React.CSSProperties),
  divider: { margin: "12px 0", borderTop: "1px solid #e2e8f0" } as React.CSSProperties,
  section: { marginBottom: 14 } as React.CSSProperties,
  badge: (active: boolean) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 99,
    fontSize: 11, fontWeight: 600,
    background: active ? "#dcfce7" : "#fee2e2",
    color: active ? "#15803d" : "#b91c1c",
  } as React.CSSProperties),
};

// ── component ────────────────────────────────────────────────────────────────
export function ScheduleEditor({ etlId, etlName, userEmail, isAdmin }: Props) {
  const [schedule, setSchedule]   = useState<ETLSchedule | null>(null);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  // form state
  const [freq, setFreq]           = useState<"daily" | "weekly" | "monthly">("daily");
  const [time, setTime]           = useState("08:00");
  const [dow, setDow]             = useState<number>(0);
  const [dom, setDom]             = useState<number>(1);
  const [backupEmail, setBackupEmail] = useState("");
  // admin-only
  const [notifyTarget, setNotifyTarget] = useState<"creator" | "group" | "specific">("creator");
  const [specificEmail, setSpecificEmail] = useState("");

  useEffect(() => {
    fetchScheduleForEtl(etlId)
      .then(s => { setSchedule(s); populateForm(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etlId]);

  function populateForm(s: ETLSchedule | null) {
    if (!s) return;
    setFreq(s.frequency);
    setTime(s.time_of_day.slice(0, 5));
    setDow(s.day_of_week ?? 0);
    setDom(s.day_of_month ?? 1);
    setBackupEmail(s.backup_email ?? "");
    setNotifyTarget((s.notify_target as any) ?? "creator");
    setSpecificEmail(s.notify_specific_email ?? "");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload: SchedulePayload = {
        etl: etlId,
        frequency: freq,
        time_of_day: time,
        day_of_week: freq === "weekly" ? dow : null,
        day_of_month: freq === "monthly" ? dom : null,
        backup_email: backupEmail || undefined,
        ...(isAdmin && {
          notify_target: notifyTarget,
          notify_specific_email: notifyTarget === "specific" ? specificEmail : "",
        }),
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
    if (!schedule) return;
    if (!confirm(`Delete schedule for "${etlName}"?`)) return;
    await deleteSchedule(schedule.id);
    setSchedule(null);
    setEditing(false);
  }

  async function handleToggle() {
    if (!schedule) return;
    const updated = await toggleSchedule(schedule.id);
    setSchedule(updated);
  }

  async function handleFireNow() {
    if (!schedule) return;
    try {
      const { apiFetch } = await import("../../api/api");
      await apiFetch(`/schedules/${schedule.id}/fire_now/`, { method: "POST" });
      alert("Execution created! Check the Executions tab.");
    } catch {
      alert("Could not trigger execution.");
    }
  }

  if (loading) return (
    <div style={{ ...S.wrap, color: "#94a3b8" }}>Loading schedule…</div>
  );

  // ── NO schedule yet ────────────────────────────────────────────────────────
  if (!schedule && !editing) {
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

  // ── Summary view ───────────────────────────────────────────────────────────
  if (schedule && !editing) {
    const freqLabel = schedule.frequency === "weekly"
      ? `Weekly (${DAYS[schedule.day_of_week ?? 0]})`
      : schedule.frequency === "monthly"
        ? `Monthly (day ${schedule.day_of_month})`
        : "Daily";

    return (
      <div style={S.wrap}>
        <div style={{ ...S.row, justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={S.badge(schedule.is_active)}>
              {schedule.is_active ? "Active" : "Paused"}
            </span>
            <span style={{ marginLeft: 8, color: "#475569", fontWeight: 600 }}>
              {freqLabel} at {schedule.time_of_day.slice(0, 5)}
            </span>
          </div>
          <div style={S.row}>
            {isAdmin && (
              <>
                <button style={S.btn("ghost")} onClick={handleToggle}>
                  {schedule.is_active ? "Pause" : "Resume"}
                </button>
                <button style={S.btn("green")} onClick={handleFireNow} title="Fire immediately">
                  ▶ Now
                </button>
              </>
            )}
            <button style={S.btn("ghost")} onClick={() => { populateForm(schedule); setEditing(true); }}>
              Edit
            </button>
          </div>
        </div>

        {/* Notify summary */}
        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
          📧 Notify:{" "}
          {isAdmin && schedule.notify_target === "group"
            ? "Entire group"
            : isAdmin && schedule.notify_target === "specific"
              ? schedule.notify_specific_email
              : schedule.effective_email}
          {schedule.backup_email && ` + backup: ${schedule.backup_email}`}
        </div>
      </div>
    );
  }

  // ── Edit / Create form ─────────────────────────────────────────────────────
  return (
    <div style={S.wrap}>
      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>
        {schedule ? "Edit Schedule" : "New Schedule"} — {etlName}
      </div>

      {/* Frequency */}
      <div style={S.section}>
        <div style={S.label}>Frequency</div>
        <select style={S.select} value={freq} onChange={e => setFreq(e.target.value as any)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {/* Time */}
      <div style={S.section}>
        <div style={S.label}>Time of day (server local)</div>
        <input type="time" style={S.input} value={time} onChange={e => setTime(e.target.value)} />
      </div>

      {/* Day of week */}
      {freq === "weekly" && (
        <div style={S.section}>
          <div style={S.label}>Day of week</div>
          <select style={S.select} value={dow} onChange={e => setDow(Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}

      {/* Day of month */}
      {freq === "monthly" && (
        <div style={S.section}>
          <div style={S.label}>Day of month (1–28)</div>
          <input
            type="number" min={1} max={28} style={S.input}
            value={dom} onChange={e => setDom(Number(e.target.value))}
          />
        </div>
      )}

      <hr style={S.divider} />

      {/* ── Admin-only: notification target ─────────────────────────────── */}
      {isAdmin && (
        <>
          <div style={S.section}>
            <div style={S.label}>Notify</div>
            <select style={S.select} value={notifyTarget} onChange={e => setNotifyTarget(e.target.value as any)}>
              <option value="creator">ETL creator only</option>
              <option value="group">Entire group</option>
              <option value="specific">Specific email</option>
            </select>
          </div>

          {notifyTarget === "specific" && (
            <div style={S.section}>
              <div style={S.label}>Specific email</div>
              <input
                type="email" style={S.input} placeholder="user@example.com"
                value={specificEmail} onChange={e => setSpecificEmail(e.target.value)}
              />
            </div>
          )}
        </>
      )}

      {/* ── Backup email (available to all) ─────────────────────────────── */}
      <div style={S.section}>
        <div style={S.label}>Backup / CC email {isAdmin ? "" : "(optional)"}</div>
        <input
          type="email" style={S.input}
          placeholder={userEmail ? `e.g. ${userEmail}` : "backup@example.com"}
          value={backupEmail}
          onChange={e => setBackupEmail(e.target.value)}
        />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          This address always receives a copy of the notification email.
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 7, background: "#fef2f2", color: "#dc2626", fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <div style={S.row}>
          {schedule && (
            <button style={S.btn("danger")} onClick={handleDelete}>Delete</button>
          )}
        </div>
        <div style={S.row}>
          <button style={S.btn("ghost")} onClick={() => setEditing(false)} disabled={saving}>
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