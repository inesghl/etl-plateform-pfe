/**
 * ScheduleEditor.tsx
 *
 * Admins:  Create / Edit / Delete / Pause / Resume / Fire Now / Approve requests
 * Users:   View schedule, Fire Now, Request a schedule (admin approves)
 */
import React, { useEffect, useState } from "react";
import {
  ETLSchedule, SchedulePayload,
  ScheduleRequest, ApproveScope,
  fetchScheduleForEtl, createSchedule, updateSchedule,
  deleteSchedule, toggleSchedule, fireScheduleNow,
  fetchRequestsForEtl, createScheduleRequest,
  approveScheduleRequest, rejectScheduleRequest, deleteScheduleRequest,
} from "../../api/scheduling";

type Props = {
  etlId: string;
  etlName: string;
  userEmail: string;
  isAdmin: boolean;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const S = {
  wrap: {
    marginTop: 12, padding: "14px 16px", borderRadius: 10,
    background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13,
  } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
  label: {
    fontSize: 11, fontWeight: 700, color: "#94a3b8",
    textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 4,
  } as React.CSSProperties,
  hint: { fontSize: 11, color: "#94a3b8", marginTop: 4 } as React.CSSProperties,
  input: {
    width: "100%", padding: "7px 10px", borderRadius: 6,
    border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
    background: "#fff", color: "#0f172a", boxSizing: "border-box" as const,
  } as React.CSSProperties,
  select: {
    width: "100%", padding: "7px 10px", borderRadius: 6,
    border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
    background: "#fff", color: "#0f172a", cursor: "pointer", boxSizing: "border-box" as const,
  } as React.CSSProperties,
  btn: (v: "primary" | "danger" | "ghost" | "green" | "orange") =>
    ({
      padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
      fontWeight: 600, fontSize: 12,
      background:
        v === "primary" ? "#2563eb"
        : v === "danger" ? "#dc2626"
        : v === "green"  ? "#16a34a"
        : v === "orange" ? "#d97706"
        : "#f1f5f9",
      color: v === "ghost" ? "#64748b" : "#fff",
    } as React.CSSProperties),
  divider: { margin: "12px 0", borderTop: "1px solid #e2e8f0" } as React.CSSProperties,
  section: { marginBottom: 14 } as React.CSSProperties,
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as React.CSSProperties,
  badge: (active: boolean) =>
    ({
      display: "inline-block", padding: "2px 8px", borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      background: active ? "#dcfce7" : "#fee2e2",
      color: active ? "#15803d" : "#b91c1c",
    } as React.CSSProperties),
};

function freqLabel(s: ETLSchedule): string {
  if (s.frequency === "weekly")  return `Weekly (${DAYS[s.day_of_week ?? 0]})`;
  if (s.frequency === "monthly") return `Monthly (day ${s.day_of_month})`;
  if (s.frequency === "yearly")  return `Yearly (${MONTHS[(s.month_of_year ?? 1) - 1]} ${s.day_of_month})`;
  return "Daily";
}

export function ScheduleEditor({ etlId, etlName, userEmail, isAdmin }: Props) {
  const [schedule, setSchedule] = useState<ETLSchedule | null>(null);
  const [requests, setRequests] = useState<ScheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firing, setFiring] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState("");

  // user request form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqNote, setReqNote] = useState("");
  const [reqFreq, setReqFreq] = useState<ETLSchedule["frequency"]>("daily");
  const [reqTime, setReqTime] = useState("08:00");
  const [reqDow, setReqDow] = useState(0);
  const [reqDom, setReqDom] = useState(1);
  const [reqMoy, setReqMoy] = useState(1);
  const [reqSaving, setReqSaving] = useState(false);

  // admin approve/reject
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveScope, setApproveScope] = useState<ApproveScope>("requester");
  const [approveEmail, setApproveEmail] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // admin edit form
  const [freq, setFreq] = useState<ETLSchedule["frequency"]>("daily");
  const [time, setTime] = useState("08:00");
  const [dow, setDow] = useState(0);
  const [dom, setDom] = useState(1);
  const [moy, setMoy] = useState(1);
  const [backupEmail, setBackupEmail] = useState("");
  const [notifyTarget, setNotifyTarget] = useState<"creator" | "group" | "specific">("creator");
  const [specificEmail, setSpecificEmail] = useState("");

  useEffect(() => {
    Promise.all([
      fetchScheduleForEtl(etlId).catch(() => null),
      fetchRequestsForEtl(etlId).catch(() => []),
    ]).then(([s, reqs]) => {
      if (s) { setSchedule(s); populate(s); }
      setRequests(reqs as ScheduleRequest[]);
    }).finally(() => setLoading(false));
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
        etl: etlId,
        frequency: freq,
        time_of_day: time,
        day_of_week: freq === "weekly" ? dow : null,
        day_of_month: ["monthly", "yearly"].includes(freq) ? dom : null,
        month_of_year: freq === "yearly" ? moy : null,
        backup_email: backupEmail || undefined,
        notify_target: notifyTarget,
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
      alert(`✅ Execution created!\nGo to the Executions tab to review and launch it.\n\nID: ${r.execution_id}`);
    } catch (e: any) {
      alert(`❌ Could not trigger execution.\n${e?.message ?? ""}`);
    } finally {
      setFiring(false);
    }
  }

  async function handleSubmitRequest() {
    setReqSaving(true);
    setError("");
    try {
      const req = await createScheduleRequest({
        etl: etlId,
        frequency: reqFreq,
        time_of_day: reqTime,
        day_of_week: reqFreq === "weekly" ? reqDow : null,
        day_of_month: ["monthly", "yearly"].includes(reqFreq) ? reqDom : null,
        month_of_year: reqFreq === "yearly" ? reqMoy : null,
        note: reqNote,
      });
      setRequests(prev => [req, ...prev]);
      setShowRequestForm(false);
      setReqNote("");
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
    } finally {
      setReqSaving(false);
    }
  }

  async function handleApprove(reqId: string) {
    try {
      const { schedule: newSchedule, request: updated } =
        await approveScheduleRequest(reqId, approveScope, approveEmail, approveNote);
      setSchedule(newSchedule);
      populate(newSchedule);
      setRequests(prev => prev.map(r => (r.id === reqId ? updated : r)));
      setApprovingId(null);
      setApproveNote("");
      setApproveEmail("");
      setApproveScope("requester");
    } catch (e: any) {
      setError(e?.message ?? "Approval failed");
    }
  }

  async function handleReject(reqId: string) {
    try {
      const updated = await rejectScheduleRequest(reqId, rejectNote);
      setRequests(prev => prev.map(r => (r.id === reqId ? updated : r)));
      setRejectingId(null);
      setRejectNote("");
    } catch (e: any) {
      setError(e?.message ?? "Rejection failed");
    }
  }

  async function handleCancelRequest(reqId: string) {
    try {
      await deleteScheduleRequest(reqId);
      setRequests(prev => prev.filter(r => r.id !== reqId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to cancel request");
    }
  }

  if (loading) {
    return <div style={{ ...S.wrap, color: "#94a3b8" }}>Loading schedule…</div>;
  }

  const pendingRequests = requests.filter(r => r.status === "pending");
  const myRequest = requests.find(r => r.status === "pending");
  const someoneElseRequested = pendingRequests.length > 0 && !myRequest;

  const panelProps = {
    requests: pendingRequests,
    approvingId, setApprovingId,
    approveScope, setApproveScope,
    approveEmail, setApproveEmail,
    approveNote, setApproveNote,
    rejectingId, setRejectingId,
    rejectNote, setRejectNote,
    onApprove: handleApprove,
    onReject: handleReject,
    S,
  };

  // ── No schedule yet ──────────────────────────────────────────────
  if (!schedule && !editing) {
    if (!isAdmin) {
      return (
        <div style={S.wrap}>
          {myRequest ? (
            <div style={{ fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: "#d97706", fontWeight: 600 }}>⏳ Schedule request pending admin review</span>
                <button
                  style={{ ...S.btn("ghost"), fontSize: 11, padding: "3px 8px" }}
                  onClick={() => handleCancelRequest(myRequest.id)}
                >
                  Cancel request
                </button>
              </div>
              <div style={{ color: "#64748b", fontSize: 11 }}>
                {myRequest.frequency} at {myRequest.time_of_day.slice(0, 5)}
                {myRequest.note ? ` · "${myRequest.note}"` : ""}
              </div>
            </div>
          ) : someoneElseRequested ? (
            <div style={{ fontSize: 12, color: "#d97706" }}>
              ⏳ A schedule request is already pending admin review for this ETL.
            </div>
          ) : showRequestForm ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 10 }}>
                Request a schedule for {etlName}
              </div>
              <div style={S.twoCol}>
                <div style={S.section}>
                  <div style={S.label}>Frequency</div>
                  <select style={S.select} value={reqFreq} onChange={e => setReqFreq(e.target.value as any)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div style={S.section}>
                  <div style={S.label}>Preferred time</div>
                  <input type="time" style={S.input} value={reqTime} onChange={e => setReqTime(e.target.value)} />
                </div>
              </div>
              {reqFreq === "weekly" && (
                <div style={S.section}>
                  <div style={S.label}>Day of week</div>
                  <select style={S.select} value={reqDow} onChange={e => setReqDow(Number(e.target.value))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {(reqFreq === "monthly" || reqFreq === "yearly") && (
                <div style={S.section}>
                  <div style={S.label}>Day of month</div>
                  <input
                    type="number" min={1} max={31} style={S.input} value={reqDom}
                    onChange={e => setReqDom(Math.min(31, Math.max(1, Number(e.target.value))))}
                  />
                </div>
              )}
              {reqFreq === "yearly" && (
                <div style={S.section}>
                  <div style={S.label}>Month</div>
                  <select style={S.select} value={reqMoy} onChange={e => setReqMoy(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              )}
              <div style={S.section}>
                <div style={S.label}>Why do you need this? (optional)</div>
                <textarea
                  value={reqNote}
                  onChange={e => setReqNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Monthly report for end-of-month closing"
                  style={{ ...S.input, resize: "vertical" as const }}
                />
              </div>
              {error && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={S.btn("ghost")} onClick={() => setShowRequestForm(false)}>Cancel</button>
                <button style={S.btn("primary")} onClick={handleSubmitRequest} disabled={reqSaving}>
                  {reqSaving ? "Sending…" : "Send request"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ ...S.row, justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>No schedule — need automation?</span>
              <button style={S.btn("primary")} onClick={() => setShowRequestForm(true)}>
                📅 Request schedule
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={S.wrap}>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: pendingRequests.length ? 12 : 0 }}>
          <span style={{ color: "#94a3b8" }}>No schedule set</span>
          <button style={S.btn("primary")} onClick={() => setEditing(true)}>+ Add Schedule</button>
        </div>
        {pendingRequests.length > 0 && <PendingRequestsPanel {...panelProps} />}
      </div>
    );
  }

  // ── Summary view ─────────────────────────────────────────────────
  if (schedule && !editing) {
    return (
      <>
        <div style={S.wrap}>
          <div style={{ ...S.row, justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <span style={S.badge(schedule.is_active)}>{schedule.is_active ? "Active" : "Paused"}</span>
              <span style={{ marginLeft: 8, color: "#475569", fontWeight: 600 }}>
                {freqLabel(schedule)} at {schedule.time_of_day.slice(0, 5)}
              </span>
            </div>
            <div style={S.row}>
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
              <button
                style={S.btn("green")}
                onClick={handleFireNow}
                disabled={firing}
                title="Create a pending execution right now — review and launch it in the Executions tab"
              >
                {firing ? "…" : "⚡ Now"}
              </button>
              {isAdmin && (
                <button style={S.btn("ghost")} onClick={() => { populate(schedule); setEditing(true); }}>
                  Edit
                </button>
              )}
            </div>
          </div>

          {isAdmin && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              📧{" "}
              {schedule.notify_target === "group"
                ? "Notifying entire group"
                : schedule.notify_target === "specific" && schedule.notify_specific_email
                  ? `Notifying: ${schedule.notify_specific_email}`
                  : `Notifying: ${schedule.effective_email}`}
              {schedule.backup_email && <span style={{ color: "#94a3b8" }}> + CC: {schedule.backup_email}</span>}
            </div>
          )}

          {schedule.last_triggered_at && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
              Last triggered: {new Date(schedule.last_triggered_at).toLocaleString()}
            </div>
          )}
        </div>

        {isAdmin && pendingRequests.length > 0 && <PendingRequestsPanel {...panelProps} />}
      </>
    );
  }

  // ── Edit / Create form (admin only) ──────────────────────────────
  return (
    <div style={S.wrap}>
      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>
        {schedule ? "Edit Schedule" : "New Schedule"} — {etlName}
      </div>

      <div style={S.twoCol}>
        <div style={S.section}>
          <div style={S.label}>Frequency</div>
          <select style={S.select} value={freq} onChange={e => setFreq(e.target.value as ETLSchedule["frequency"])}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div style={S.section}>
          <div style={S.label}>Time (server local)</div>
          <input type="time" style={S.input} value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>

      {freq === "weekly" && (
        <div style={S.section}>
          <div style={S.label}>Day of week</div>
          <select style={S.select} value={dow} onChange={e => setDow(Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      )}

      {freq === "monthly" && (
        <div style={S.section}>
          <div style={S.label}>Day of month (1–31)</div>
          <input
            type="number" min={1} max={31} style={S.input} value={dom}
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
            <select style={S.select} value={moy} onChange={e => setMoy(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={S.section}>
            <div style={S.label}>Day</div>
            <input
              type="number" min={1} max={31} style={S.input} value={dom}
              onChange={e => setDom(Math.min(31, Math.max(1, Number(e.target.value))))}
            />
            {moy === 2 && dom > 28 && (
              <div style={{ ...S.hint, color: "#d97706" }}>February max is 28 — will fire on Feb 28.</div>
            )}
          </div>
        </div>
      )}

      <hr style={S.divider} />

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

      <div style={S.section}>
        <div style={S.label}>Backup / CC email (optional)</div>
        <input
          type="email" style={S.input}
          placeholder={userEmail ? `e.g. ${userEmail}` : "backup@example.com"}
          value={backupEmail} onChange={e => setBackupEmail(e.target.value)}
        />
        <div style={S.hint}>Always receives a copy of the notification email.</div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 7, background: "#fef2f2", color: "#dc2626", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <div>
          {schedule && <button style={S.btn("danger")} onClick={handleDelete}>Delete</button>}
        </div>
        <div style={S.row}>
          <button style={S.btn("ghost")} disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
          <button style={S.btn("primary")} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PendingRequestsPanel ────────────────────────────────────────────

type PanelProps = {
  requests: ScheduleRequest[];
  approvingId: string | null;
  setApprovingId: (id: string | null) => void;
  approveScope: ApproveScope;
  setApproveScope: (s: ApproveScope) => void;
  approveEmail: string;
  setApproveEmail: (s: string) => void;
  approveNote: string;
  setApproveNote: (s: string) => void;
  rejectingId: string | null;
  setRejectingId: (id: string | null) => void;
  rejectNote: string;
  setRejectNote: (s: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  S: typeof S;
};

function PendingRequestsPanel({
  requests, S,
  approvingId, setApprovingId,
  approveScope, setApproveScope,
  approveEmail, setApproveEmail,
  approveNote, setApproveNote,
  rejectingId, setRejectingId,
  rejectNote, setRejectNote,
  onApprove, onReject,
}: PanelProps) {
  const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#d97706", marginBottom: 8 }}>
        ⏳ {requests.length} pending schedule request{requests.length !== 1 ? "s" : ""}
      </div>
      {requests.map(req => {
        const label =
          req.frequency === "weekly"  ? `Weekly (${SHORT_DAYS[req.day_of_week ?? 0]})` :
          req.frequency === "monthly" ? `Monthly (day ${req.day_of_month})` :
          req.frequency === "yearly"  ? `Yearly (${SHORT_MONTHS[(req.month_of_year ?? 1) - 1]} ${req.day_of_month})` :
          "Daily";
        return (
          <div key={req.id} style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                  {req.requested_by_username}
                  <span style={{ fontWeight: 400, color: "#64748b" }}> · {req.requested_by_email}</span>
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                  {label} at {req.time_of_day.slice(0, 5)}
                </div>
                {req.note && (
                  <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", marginTop: 3 }}>"{req.note}"</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={S.btn("green")} onClick={() => { setApprovingId(req.id); setRejectingId(null); }}>✓ Approve</button>
                <button style={S.btn("danger")} onClick={() => { setRejectingId(req.id); setApprovingId(null); }}>✕ Reject</button>
              </div>
            </div>

            {approvingId === req.id && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#f0fdf4", borderRadius: 7, border: "1px solid #86efac" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#15803d", marginBottom: 8 }}>
                  Approve — who gets notified when the schedule fires?
                </div>
                <div style={S.section}>
                  <div style={S.label}>Notify</div>
                  <select style={S.select} value={approveScope} onChange={e => setApproveScope(e.target.value as ApproveScope)}>
                    <option value="requester">Just {req.requested_by_username}</option>
                    <option value="group">Their whole group</option>
                    <option value="specific">Specific email</option>
                  </select>
                </div>
                {approveScope === "specific" && (
                  <div style={S.section}>
                    <div style={S.label}>Email</div>
                    <input type="email" style={S.input} value={approveEmail} placeholder="someone@company.com" onChange={e => setApproveEmail(e.target.value)} />
                  </div>
                )}
                <div style={S.section}>
                  <div style={S.label}>Note to user (optional)</div>
                  <input type="text" style={S.input} value={approveNote} placeholder="e.g. Schedule set for end of month" onChange={e => setApproveNote(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={S.btn("ghost")} onClick={() => setApprovingId(null)}>Cancel</button>
                  <button style={S.btn("green")} onClick={() => onApprove(req.id)}>Confirm approval</button>
                </div>
              </div>
            )}

            {rejectingId === req.id && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#fef2f2", borderRadius: 7, border: "1px solid #fca5a5" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#b91c1c", marginBottom: 8 }}>Reject request</div>
                <div style={S.section}>
                  <div style={S.label}>Reason (optional)</div>
                  <input type="text" style={S.input} value={rejectNote} placeholder="e.g. Please use the ⚡ Now button instead" onChange={e => setRejectNote(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={S.btn("ghost")} onClick={() => setRejectingId(null)}>Cancel</button>
                  <button style={S.btn("danger")} onClick={() => onReject(req.id)}>Confirm rejection</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}