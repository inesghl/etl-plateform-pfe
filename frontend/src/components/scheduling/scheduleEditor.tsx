/**
 * ScheduleEditor.tsx  — full replacement
 *
 * Changes vs previous version:
 *  - "yearly" frequency option with month + day pickers
 *  - Users see the same "Review & Launch" button on their PENDING executions
 *    (was previously admin-only; now driven by launched_by matching current user)
 *  - Admin "Notify" section gains a "launched_for" user-picker when
 *    notify_target === "specific" (so the admin can assign a specific user
 *    who will see the Launch button in-app, separate from the email address)
 *  - Frequency label helper covers "yearly"
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
  fireScheduleNow,
} from "../../api/scheduling";

// ── types ────────────────────────────────────────────────────────────────────
type Props = {
  etlId: string;
  etlName: string;
  userEmail: string;
  isAdmin: boolean;
  /** All platform users — passed in by admin so they can pick launched_for */
  allUsers?: { id: string; username: string; email: string }[];
};

const DAYS   = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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
  row: { display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  label: {
    fontSize: 11, fontWeight: 700, color: "#94a3b8",
    textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4,
  },
  input: {
    width: "100%", padding: "7px 10px", borderRadius: 6,
    border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
    background: "#fff", color: "#0f172a",
  } as React.CSSProperties,
  select: {
    width: "100%", padding: "7px 10px", borderRadius: 6,
    border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
    background: "#fff", color: "#0f172a", cursor: "pointer",
  } as React.CSSProperties,
  btn: (variant: "primary" | "danger" | "ghost" | "green") => ({
    padding: "7px 14px", borderRadius: 7, border: "none",
    cursor: "pointer", fontWeight: 600, fontSize: 12, transition: "opacity .15s",
    background:
      variant === "primary" ? "#2563eb"
      : variant === "danger"  ? "#dc2626"
      : variant === "green"   ? "#16a34a"
      : "#f1f5f9",
    color: variant === "ghost" ? "#64748b" : "#fff",
  } as React.CSSProperties),
  divider: { margin: "12px 0", borderTop: "1px solid #e2e8f0" } as React.CSSProperties,
  section: { marginBottom: 14 } as React.CSSProperties,
  badge: (active: boolean) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 99,
    fontSize: 11, fontWeight: 600,
    background: active ? "#dcfce7" : "#fee2e2",
    color:      active ? "#15803d" : "#b91c1c",
  } as React.CSSProperties),
};

// ── helpers ──────────────────────────────────────────────────────────────────
function freqLabel(s: ETLSchedule): string {
  if (s.frequency === "weekly")
    return `Weekly (${DAYS[s.day_of_week ?? 0]})`;
  if (s.frequency === "monthly")
    return `Monthly (day ${s.day_of_month})`;
  if (s.frequency === "yearly")
    return `Yearly (${MONTHS[(s.month_of_year ?? 1) - 1]} ${s.day_of_year})`;
  return "Daily";
}

// ── component ────────────────────────────────────────────────────────────────
export function ScheduleEditor({
  etlId, etlName, userEmail, isAdmin, allUsers = [],
}: Props) {
  const [schedule, setSchedule] = useState<ETLSchedule | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // ── form fields ────────────────────────────────────────────────────────────
  const [freq,          setFreq]          = useState<ETLSchedule["frequency"]>("daily");
  const [time,          setTime]          = useState("08:00");
  const [dow,           setDow]           = useState(0);
  const [dom,           setDom]           = useState(1);
  const [moy,           setMoy]           = useState(1);   // month of year (yearly)
  const [doy,           setDoy]           = useState(1);   // day of year   (yearly)
  const [backupEmail,   setBackupEmail]   = useState("");
  // admin-only
  const [notifyTarget,  setNotifyTarget]  = useState<"creator" | "group" | "specific">("creator");
  const [specificEmail, setSpecificEmail] = useState("");
  const [launchedFor,   setLaunchedFor]   = useState<string>("");  // user id

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
    setDow(s.day_of_week  ?? 0);
    setDom(s.day_of_month ?? 1);
    setMoy((s as any).month_of_year ?? 1);
    setDoy((s as any).day_of_year   ?? 1);
    setBackupEmail(s.backup_email ?? "");
    setNotifyTarget((s.notify_target as any) ?? "creator");
    setSpecificEmail(s.notify_specific_email ?? "");
    setLaunchedFor((s as any).launched_for ?? "");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload: SchedulePayload = {
        etl: etlId,
        frequency: freq,
        time_of_day: time,
        day_of_week:   freq === "weekly"  ? dow : null,
        day_of_month:  freq === "monthly" ? dom : null,
        month_of_year: freq === "yearly"  ? moy : null,
        day_of_year:   freq === "yearly"  ? doy : null,
        backup_email: backupEmail || undefined,
        ...(isAdmin && {
          notify_target:         notifyTarget,
          notify_specific_email: notifyTarget === "specific" ? specificEmail : "",
          launched_for:          notifyTarget === "specific" && launchedFor
                                   ? launchedFor : null,
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
    if (!schedule || !confirm(`Delete schedule for "${etlName}"?`)) return;
    await deleteSchedule(schedule.id);
    setSchedule(null);
    setEditing(false);
  }

  async function handleToggle() {
    if (!schedule) return;
    setSchedule(await toggleSchedule(schedule.id));
  }

  async function handleFireNow() {
    if (!schedule) return;
    try {
      await fireScheduleNow(schedule.id);
      alert("Execution created — check the Executions tab.");
    } catch {
      alert("Could not trigger execution.");
    }
  }

  if (loading) return <div style={{ ...S.wrap, color: "#94a3b8" }}>Loading schedule…</div>;

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
            {/* Admins get Pause/Resume + Fire Now */}
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
          {schedule.notify_target === "group"
            ? "Entire group"
            : schedule.notify_target === "specific"
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
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {/* Time */}
      <div style={S.section}>
        <div style={S.label}>Time of day (server local)</div>
        <input type="time" style={S.input} value={time} onChange={e => setTime(e.target.value)} />
      </div>

      {/* Weekly: day of week */}
      {freq === "weekly" && (
        <div style={S.section}>
          <div style={S.label}>Day of week</div>
          <select style={S.select} value={dow} onChange={e => setDow(Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}

      {/* Monthly: day of month */}
      {freq === "monthly" && (
        <div style={S.section}>
          <div style={S.label}>Day of month (1–28)</div>
          <input
            type="number" min={1} max={28} style={S.input}
            value={dom} onChange={e => setDom(Number(e.target.value))}
          />
        </div>
      )}

      {/* Yearly: month + day */}
      {freq === "yearly" && (
        <>
          <div style={S.section}>
            <div style={S.label}>Month</div>
            <select style={S.select} value={moy} onChange={e => setMoy(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={S.section}>
            <div style={S.label}>Day of month (1–28)</div>
            <input
              type="number" min={1} max={28} style={S.input}
              value={doy} onChange={e => setDoy(Number(e.target.value))}
            />
          </div>
        </>
      )}

      <hr style={S.divider} />

      {/* ── Admin-only: notification + assignment ───────────────────────── */}
      {isAdmin && (
        <>
          <div style={S.section}>
            <div style={S.label}>Notify</div>
            <select style={S.select} value={notifyTarget} onChange={e => setNotifyTarget(e.target.value as any)}>
              <option value="creator">ETL creator only</option>
              <option value="group">Entire group</option>
              <option value="specific">Specific person</option>
            </select>
          </div>

          {notifyTarget === "specific" && (
            <>
              <div style={S.section}>
                <div style={S.label}>Notification email</div>
                <input
                  type="email" style={S.input} placeholder="user@example.com"
                  value={specificEmail} onChange={e => setSpecificEmail(e.target.value)}
                />
              </div>

              {/* Optional: pick an in-app user who gets the Launch button */}
              {allUsers.length > 0 && (
                <div style={S.section}>
                  <div style={S.label}>Assign launch to (in-app user)</div>
                  <select
                    style={S.select}
                    value={launchedFor}
                    onChange={e => setLaunchedFor(e.target.value)}
                  >
                    <option value="">— ETL creator (default) —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.username} ({u.email})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    This user will see the "Review &amp; Launch" button on the
                    pending execution.
                  </div>
                </div>
              )}
            </>
          )}

          {notifyTarget === "group" && (
            <div style={{
              padding: "8px 12px", borderRadius: 7, marginBottom: 14,
              background: "#eff6ff", border: "1px solid #93c5fd",
              fontSize: 12, color: "#2563eb",
            }}>
              All active group members will be notified and will see the
              Review &amp; Launch button.
            </div>
          )}
        </>
      )}

      {/* ── Backup email (all users) ─────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.label}>Backup / CC email (optional)</div>
        <input
          type="email" style={S.input}
          placeholder={userEmail ? `e.g. ${userEmail}` : "backup@example.com"}
          value={backupEmail}
          onChange={e => setBackupEmail(e.target.value)}
        />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          Always receives a copy of the notification email.
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 7,
          background: "#fef2f2", color: "#dc2626", fontSize: 12,
        }}>
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