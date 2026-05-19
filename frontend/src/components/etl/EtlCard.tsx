// components/etl/EtlCard.tsx
import React, { useState } from "react";
import { Etl } from "../../types/etl";
import { UserGroup } from "../../types/group";
import { User } from "../../types/user";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Card } from "../common/Card";
import { deleteEtl, editEtl, assignEtlGroups } from "../../api/etl";
import { ScheduleEditor } from "../scheduling/scheduleEditor";

const T = {
  border: "#e2e8f0", surface: "#f8fafc", text: "#0f172a",
  textMid: "#475569", textMuted: "#94a3b8",
  accent: "#2563eb", accentBg: "#eff6ff", accentBorder: "#93c5fd",
  success: "#16a34a", successBg: "#f0fdf4",
  danger: "#dc2626", dangerBg: "#fef2f2", dangerBorder: "#fca5a5",
  warn: "#b45309", warnBg: "#fffbeb", warnBorder: "#fde68a",
  r: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: T.r,
  border: `1px solid ${T.border}`, background: T.surface,
  color: T.text, fontSize: 13, boxSizing: "border-box", outline: "none",
};

type Props = {
  etl: Etl;
  isAdmin: boolean;
  currentUser?: User;                // ← added
  availableGroups?: UserGroup[];
  onValidate?: (id: string) => Promise<void>;
  onActivate?: (id: string) => Promise<void>;
  onLaunch?: (etl: Etl) => void;
  onRefresh?: () => void;
};

export function EtlCard({
  etl, isAdmin, currentUser, availableGroups = [],
  onValidate, onActivate, onLaunch, onRefresh,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  async function handle(action: "validate" | "activate") {
    try {
      setBusy(action); setErr(null);
      if (action === "validate") await onValidate?.(etl.id);
      else await onActivate?.(etl.id);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  }

  const inputReqs = etl.config?.input_requirements ?? {};
  const expectedOutputs = etl.config?.expected_outputs ?? [];
  const hasConfig = etl.config && Object.keys(etl.config).length > 0;

  return (
    <>
      <Card style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{etl.name}</div>
              {isAdmin && (
                <span style={{
                  fontSize: 10, padding: "1px 7px", borderRadius: 99,
                  background: etl.is_restricted ? "#fef3c7" : T.successBg,
                  color: etl.is_restricted ? "#92400e" : T.success,
                  border: `1px solid ${etl.is_restricted ? "#fde68a" : "#86efac"}`,
                  fontWeight: 600,
                }}>
                  {etl.is_restricted
                    ? `🔒 ${etl.allowed_groups.length} group${etl.allowed_groups.length !== 1 ? "s" : ""}`
                    : "🌐 All users"}
                </span>
              )}
            </div>

            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span>v{etl.version}</span>
              <span>·</span>
              <span>{new Date(etl.created_at).toLocaleDateString()}</span>
              {etl.entry_point_path && <><span>·</span><span style={{ fontFamily: "monospace" }}>{etl.entry_point_path}</span></>}
              {etl.python_version && <><span>·</span><span>Python {etl.python_version}</span></>}
            </div>

            {etl.description && (
              <div style={{ fontSize: 13, color: T.textMid, marginTop: 4 }}>{etl.description}</div>
            )}

            {isAdmin && etl.is_restricted && (
              <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {etl.allowed_groups.map(g => (
                  <span key={g.id} style={{
                    fontSize: 11, padding: "1px 8px", borderRadius: 99,
                    background: T.accentBg, color: T.accent, border: `1px solid ${T.accentBorder}`,
                  }}>
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {hasConfig && (
              <button onClick={() => setShowConfig(s => !s)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: T.textMuted, marginTop: 6, padding: 0,
              }}>
                {showConfig ? "▲ Hide config" : "▼ Show config"}
              </button>
            )}

            {showConfig && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: T.r, background: T.surface, border: `1px solid ${T.border}` }}>
                {etl.config_file_path && (
                  <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontFamily: "monospace" }}>
                    {etl.config_file_path}
                  </div>
                )}
                {Object.keys(inputReqs).length > 0 && (
                  <div style={{ fontSize: 12, color: T.textMid, marginBottom: 4 }}>
                    <strong>Inputs:</strong>{" "}
                    {Object.entries(inputReqs).map(([k, s]: [string, any]) => `${k}${s.required ? " *" : ""}`).join(", ")}
                  </div>
                )}
                {expectedOutputs.length > 0 && (
                  <div style={{ fontSize: 12, color: T.textMid, marginBottom: 4 }}>
                    <strong>Expected outputs:</strong> {expectedOutputs.join(", ")}
                  </div>
                )}
                {Object.entries(etl.config || {})
                  .filter(([k]) => !["input_requirements", "expected_outputs", "entry_point"].includes(k))
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <div key={k} style={{ fontSize: 12, color: T.textMid, marginBottom: 2 }}>
                      <strong>{k}:</strong> {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </div>
                  ))}
              </div>
            )}

        {etl.validation_errors && etl.validation_errors.length > 0 && (
  <div style={{ marginTop: 6, fontSize: 11, color: T.danger, background: T.dangerBg, padding: "4px 8px", borderRadius: 6, display: "inline-block" }}>
    {etl.validation_errors.join(" · ")}
  </div>
)}

{/* Schedule editor — visible to all users */}
<ScheduleEditor
  etlId={etl.id}
  etlName={etl.name}
  userEmail={currentUser?.email ?? ""}
  isAdmin={isAdmin}
/>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Badge label={etl.is_validated ? "validated" : "not validated"} color={etl.is_validated ? T.success : T.textMuted} />
            <Badge label={etl.is_active ? "active" : "inactive"} color={etl.is_active ? T.accent : T.textMuted} />

            {isAdmin && (
              <Button small variant="ghost" onClick={() => setShowEdit(true)}>✏ Edit</Button>
            )}
            {isAdmin && (
              <Button small variant="ghost" onClick={() => setShowAssign(true)}>👥 Groups</Button>
            )}
            {isAdmin && !etl.is_validated && (
              <Button small variant="secondary" disabled={!!busy} onClick={() => handle("validate")}>
                {busy === "validate" ? "…" : "✓ Validate"}
              </Button>
            )}
            {isAdmin && etl.is_validated && !etl.is_active && (
              <Button small variant="success" disabled={!!busy} onClick={() => handle("activate")}>
                {busy === "activate" ? "…" : "▶ Activate"}
              </Button>
            )}
            {isAdmin && (
              <Button small variant="danger" onClick={async () => {
                if (confirm(`Delete ${etl.name}? This cannot be undone.`)) {
                  try {
                    await deleteEtl(etl.id);
                    onRefresh?.();
                  } catch (e: any) { setErr(`Delete failed: ${e.message}`); }
                }
              }}>
                Delete
              </Button>
            )}
            {!isAdmin && etl.is_active && etl.is_validated && (
              <Button onClick={() => onLaunch?.(etl)}>▶ Launch</Button>
            )}
          </div>
        </div>

        {err && <div style={{ marginTop: 8, fontSize: 12, color: T.danger }}>{err}</div>}
      </Card>

      {showEdit && (
        <EditEtlModal
          etl={etl}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onRefresh?.(); }}
        />
      )}
      {showAssign && (
        <AssignGroupsModal
          etl={etl}
          availableGroups={availableGroups}
          onClose={() => setShowAssign(false)}
          onSaved={() => { setShowAssign(false); onRefresh?.(); }}
        />
      )}
    </>
  );
}

// ── EditEtlModal ──────────────────────────────────────────────────

function EditEtlModal({ etl, onClose, onSaved }: {
  etl: Etl; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(etl.name);
  const [description, setDescription] = useState(etl.description);
  const [version, setVersion] = useState(etl.version);
  const [entryPointPath, setEntryPointPath] = useState(etl.entry_point_path);
  const [configFilePath, setConfigFilePath] = useState(etl.config_file_path);
  const [requirementsPath, setRequirementsPath] = useState(etl.requirements_path);
  const [pythonVersion, setPythonVersion] = useState(etl.python_version);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    try {
      setBusy(true); setErr(null);
      await editEtl(etl.id, {
        name: name.trim(), description: description.trim(),
        version: version.trim(), entry_point_path: entryPointPath.trim(),
        config_file_path: configFilePath.trim(),
        requirements_path: requirementsPath.trim(),
        python_version: pythonVersion.trim(),
      });
      onSaved();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose} title="Edit ETL" subtitle={etl.name}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Version" style={{ flex: 1 }}>
            <input value={version} onChange={e => setVersion(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Python version" style={{ width: 130 }}>
            <input value={pythonVersion} onChange={e => setPythonVersion(e.target.value)}
              style={inputStyle} placeholder="e.g. 3.11" />
          </Field>
        </div>
        <Field label="Entry point path">
          <input value={entryPointPath} onChange={e => setEntryPointPath(e.target.value)}
            style={inputStyle} placeholder="e.g. main.py" />
        </Field>
        <Field label="Config file path">
          <input value={configFilePath} onChange={e => setConfigFilePath(e.target.value)}
            style={inputStyle} placeholder="e.g. config/config.json" />
        </Field>
        <Field label="Requirements path">
          <input value={requirementsPath} onChange={e => setRequirementsPath(e.target.value)}
            style={inputStyle} placeholder="e.g. requirements.txt" />
        </Field>
        {err && <div style={{ fontSize: 12, color: T.danger }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{
            padding: "7px 14px", borderRadius: T.r, fontSize: 13,
            border: `1px solid ${T.border}`, background: "transparent", color: T.textMid, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handleSave} disabled={busy || !name.trim()} style={{
            padding: "7px 16px", borderRadius: T.r, fontSize: 13,
            border: "none", background: T.accent, color: "#fff",
            fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1,
          }}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── AssignGroupsModal ─────────────────────────────────────────────

function AssignGroupsModal({ etl, availableGroups, onClose, onSaved }: {
  etl: Etl; availableGroups: UserGroup[];
  onClose: () => void; onSaved: () => void;
}) {
  const currentIds = new Set(etl.allowed_groups.map(g => g.id));
  const [selected, setSelected] = useState<Set<string>>(new Set(currentIds));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function handleSave() {
    try {
      setBusy(true); setErr(null);
      await assignEtlGroups(etl.id, [...selected]);
      onSaved();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose} title="Assign groups" subtitle={etl.name}>
      <div style={{
        padding: "10px 14px", borderRadius: T.r, marginBottom: 14,
        background: T.accentBg, border: `1px solid ${T.accentBorder}`,
        fontSize: 12, color: T.accent,
      }}>
        Select which groups can access this ETL. Leave all unchecked to make it available to everyone.
      </div>
      {availableGroups.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textMuted, padding: "12px 0" }}>
          No groups exist yet. Create groups in the Groups tab first.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {availableGroups.map(g => (
            <label key={g.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: T.r, cursor: "pointer",
              border: `1px solid ${selected.has(g.id) ? T.accentBorder : T.border}`,
              background: selected.has(g.id) ? T.accentBg : "#fff",
              transition: "all .12s",
            }}>
              <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{g.name}</div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                  {g.description ? ` · ${g.description}` : ""}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
      {selected.size === 0 && availableGroups.length > 0 && (
        <div style={{
          padding: "8px 12px", borderRadius: T.r, marginBottom: 12,
          background: T.warnBg, border: `1px solid ${T.warnBorder}`,
          fontSize: 12, color: T.warn,
        }}>
          ⚠ No groups selected — this ETL will be visible to all users.
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: T.danger, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={{
          padding: "7px 14px", borderRadius: T.r, fontSize: 13,
          border: `1px solid ${T.border}`, background: "transparent", color: T.textMid, cursor: "pointer",
        }}>Cancel</button>
        <button onClick={handleSave} disabled={busy} style={{
          padding: "7px 16px", borderRadius: T.r, fontSize: 13,
          border: "none", background: T.accent, color: "#fff",
          fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1,
        }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Shared mini-components ────────────────────────────────────────

function Overlay({ children, onClose, title, subtitle }: {
  children: React.ReactNode; onClose: () => void; title: string; subtitle?: string;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, backdropFilter: "blur(2px)",
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, width: "92%", maxWidth: 560,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 20,
            cursor: "pointer", color: T.textMuted, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, style }: {
  label: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}