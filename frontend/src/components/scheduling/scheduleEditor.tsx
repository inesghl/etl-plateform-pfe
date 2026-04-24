/**
 * ScheduleEditor.tsx
 * ──────────────────
 * A compact inline schedule editor that lives inside the ETL card (admin only).
 * Shows the current schedule as a single readable line; clicking "Edit" expands
 * a tidy form. Handles create / update / delete / toggle.
 */

import React, { useEffect, useState } from "react";
import {
  ETLSchedule, Frequency, SchedulePayload,
  fetchScheduleForEtl, createSchedule, updateSchedule,
  deleteSchedule, toggleSchedule,
} from "../../api/scheduling";

// ─── Design tokens (match existing platform palette) ───────────────────────

const T = {
  bg:         "#ffffff",
  surface:    "#f8fafc",
  border:     "#e2e8f0",
  text:       "#0f172a",
  textMid:    "#475569",
  textMuted:  "#94a3b8",
  accent:     "#2563eb",
  accentBg:   "#eff6ff",
  accentBdr:  "#93c5fd",
  success:    "#16a34a",
  successBg:  "#f0fdf4",
  successBdr: "#86efac",
  warn:       "#b45309",
  warnBg:     "#fffbeb",
  danger:     "#dc2626",
  dangerBg:   "#fef2f2",
  dangerBdr:  "#fca5a5",
  r:          "8px",
  mono:       "'JetBrains Mono','Fira Code',monospace",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: T.r,
  border: `1px solid ${T.border}`,
  background: "#f1f5f9",
  color: T.text,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function humanSchedule(s: ETLSchedule): string {
  const t = s.time_of_day.slice(0, 5); // HH:MM
  if (s.frequency === "daily")   return `Daily at ${t}`;
  if (s.frequency === "weekly")  return `Every ${DAYS[s.day_of_week ?? 0]} at ${t}`;
  if (s.frequency === "monthly") return `Monthly on day ${s.day_of_month} at ${t}`;
  return `${s.frequency} at ${t}`;
}

function lastFiredLabel(s: ETLSchedule): string {
  if (!s.last_triggered_at) return "Never fired";
  const d = new Date(s.last_triggered_at);
  return `Last: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  etlId: string;
  etlName: string;
  userEmail?: string;
};

export function ScheduleEditor({ etlId, etlName, userEmail = "" }: Props) {
  const [schedule,  setSchedule]  = useState<ETLSchedule | null>(null);
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Form state
  const [freq,     setFreq]     = useState<Frequency>("daily");
  const [time,     setTime]     = useState("08:00");
  const [dow,      setDow]      = useState<number>(0);
  const [dom,      setDom]      = useState<number>(1);
  const [email,    setEmail]    = useState(userEmail);

  useEffect(() => {
    fetchScheduleForEtl(etlId)
      .then(s => { setSchedule(s); if (s) populateForm(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [etlId]);

  function populateForm(s: ETLSchedule) {
    setFreq(s.frequency);
    setTime(s.time_of_day.slice(0, 5));
    setDow(s.day_of_week ?? 0);
    setDom(s.day_of_month ?? 1);
    setEmail(s.notify_email || "");
  }

  function openEditor() {
    if (!schedule) {
      setFreq("daily"); setTime("08:00"); setDow(0); setDom(1); setEmail(userEmail);
    }
    setOpen(true);
    setError(null);
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const payload: SchedulePayload = {
        etl: etlId,
        frequency: freq,
        time_of_day: time,
        day_of_week:  freq === "weekly"  ? dow : null,
        day_of_month: freq === "monthly" ? dom : null,
        notify_email: email,
      };
      let updated: ETLSchedule;
      if (schedule) {
        updated = await updateSchedule(schedule.id, payload);
      } else {
        updated = await createSchedule(payload);
      }
      setSchedule(updated);
      setOpen(false);
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    if (!schedule) return;
    setSaving(true);
    try {
      const updated = await toggleSchedule(schedule.id);
      setSchedule(updated);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!schedule) return;
    if (!window.confirm(`Remove schedule for "${etlName}"?`)) return;
    setSaving(true);
    try {
      await deleteSchedule(schedule.id);
      setSchedule(null);
      setOpen(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return null;

  return (
    <div style={{ marginTop: 8 }}>

      {/* ── Collapsed summary bar ── */}
      {!open && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px",
          borderRadius: T.r,
          border: `1px solid ${schedule ? (schedule.is_active ? T.accentBdr : T.border) : T.border}`,
          background: schedule ? (schedule.is_active ? T.accentBg : T.surface) : T.surface,
          fontSize: 12,
        }}>
          {/* Clock icon */}
          <span style={{ fontSize: 14, lineHeight: 1 }}>🕐</span>

          {schedule ? (
            <>
              <span style={{ flex: 1, color: schedule.is_active ? T.accent : T.textMuted, fontWeight: 500 }}>
                {humanSchedule(schedule)}
              </span>
              <span style={{ fontSize: 11, color: T.textMuted }}>{lastFiredLabel(schedule)}</span>

              {/* Active pill */}
              <span style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 99, fontWeight: 600,
                background: schedule.is_active ? T.successBg : T.warnBg,
                color:      schedule.is_active ? T.success    : T.warn,
                border:     `1px solid ${schedule.is_active ? T.successBdr : "#fde68a"}`,
              }}>
                {schedule.is_active ? "Active" : "Paused"}
              </span>

              <button onClick={handleToggle} disabled={saving} style={ghostBtn}>
                {schedule.is_active ? "Pause" : "Resume"}
              </button>
              <button onClick={openEditor} style={ghostBtn}>Edit</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, color: T.textMuted }}>No schedule set</span>
              <button
                onClick={openEditor}
                style={{
                  ...ghostBtn,
                  color: T.accent,
                  borderColor: T.accentBdr,
                  background: T.accentBg,
                }}
              >
                + Add schedule
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Expanded editor ── */}
      {open && (
        <div style={{
          padding: 14, borderRadius: T.r,
          border: `1px solid ${T.accentBdr}`,
          background: T.accentBg,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 12 }}>
            {schedule ? "Edit schedule" : "Add schedule"} — {etlName}
          </div>

          {/* Row 1: Frequency + time */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={labelStyle}>Frequency</label>
              <select
                value={freq}
                onChange={e => setFreq(e.target.value as Frequency)}
                style={{ ...inputStyle, minWidth: 110 }}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={labelStyle}>Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                style={{ ...inputStyle, minWidth: 100 }}
              />
            </div>

            {freq === "weekly" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={labelStyle}>Day</label>
                <select
                  value={dow}
                  onChange={e => setDow(Number(e.target.value))}
                  style={{ ...inputStyle, minWidth: 110 }}
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}

            {freq === "monthly" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={labelStyle}>Day of month</label>
                <input
                  type="number" min={1} max={28} value={dom}
                  onChange={e => setDom(Number(e.target.value))}
                  style={{ ...inputStyle, width: 70 }}
                />
              </div>
            )}
          </div>

          {/* Row 2: email */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            <label style={labelStyle}>
              Notify email
              <span style={{ color: T.textMuted, fontWeight: 400, marginLeft: 4 }}>
                (receives "review & launch" email when schedule fires)
              </span>
            </label>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ ...inputStyle, maxWidth: 320 }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 10, padding: "7px 10px",
              borderRadius: T.r, background: T.dangerBg,
              color: T.danger, fontSize: 12, border: `1px solid ${T.dangerBdr}`,
            }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {schedule && (
                <button onClick={handleDelete} disabled={saving} style={{
                  ...ghostBtn,
                  color: T.danger, borderColor: T.dangerBdr, background: T.dangerBg,
                }}>
                  Remove schedule
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setOpen(false)} disabled={saving} style={ghostBtn}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  ...ghostBtn,
                  background: T.accent, color: "#fff",
                  borderColor: T.accent, fontWeight: 600,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : schedule ? "Update" : "Save schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#475569",
};

const ghostBtn: React.CSSProperties = {
  padding: "5px 10px", borderRadius: T.r,
  border: `1px solid ${T.border}`,
  background: "#fff", color: T.textMid,
  fontSize: 11, cursor: "pointer", fontWeight: 500,
};