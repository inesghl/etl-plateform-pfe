import React, { useState, useEffect } from "react";
import { Etl } from "../../types/etl";
import { Execution, OutputDelivery } from "../../types/execution";
import { Button } from "../common/Button";
import { apiFetch } from "../../api/api";
import { prepareExecution, updateExecutionConfig, deleteExecution, cancelExecution } from "../../api/execution";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Classification = "input" | "output" | "skip";

type ColStat = {
  dtype: string; null_count: number; null_pct: number;
  min?: number | null; max?: number | null; mean?: number | null; std?: number | null;
  unique_count?: number; unique_values?: string[];
};

type DataframePreview = {
  columns?: string[]; dtypes?: Record<string, string>;
  col_stats?: Record<string, ColStat>; row_count?: number | null;
  col_count?: number; sample_rows?: string[][];
  skipped?: boolean; reason?: string; error?: string;
};

type FileCheck = {
  key: string; pattern: string;
  is_placeholder: boolean; is_wildcard: boolean;
  matched_files: string[]; ok: boolean;
  warning?: string; dataframe_preview?: DataframePreview;
};

type FileCountCheck = { declared: number; actual: number; ok: boolean };

type FoundFile = { name: string; size_display: string; extension: string };

type PathEntry = {
  config_key: string; path: string | null; raw_path?: string | null;
  accessible: boolean; classification: Classification;
  path_type?: "absolute" | "relative_to_zip";
  issue?: string; warnings?: string[];
  size_display?: string; size_bytes?: number; last_modified?: string;
  extension?: string; is_file?: boolean; is_dir?: boolean; files_in_dir?: number;
  dataframe_preview?: DataframePreview;
  is_placeholder?: boolean;
  // folder-block extras
  folder_accessible?: boolean;
  file_checks?: FileCheck[];
  file_count_check?: FileCountCheck;
  found_files?: FoundFile[];   // output folders: files found after execution
};

type CheckResults = {
  mode: string; inputs: PathEntry[]; outputs: PathEntry[]; other: PathEntry[];
  inputs_accessible: boolean; inputs_missing: string[];
  unclassified_path_keys: string[]; config_used: Record<string, any>;
};

type PrepareData = {
  execution_id: string; etl_config: Record<string, any>;
  execution_config: Record<string, any>; config_file_path?: string;
  path_like_keys: Record<string, string>;
  path_classifications: Record<string, string>;
  output_delivery: OutputDelivery; notify_email: string;
  config_diff?: Record<string, { from: any; to: any }>;
};

type Props = {
  etl: Etl; onClose: () => void; onDone: () => void;
  onCreateExecution: (etlId: string, label: string) => Promise<any>;
  onLaunch: (executionId: string) => Promise<void>;
  /** Resume an existing PENDING/VALIDATED execution (e.g. a scheduled run
   *  the user is about to review) instead of creating a brand new one. */
  resumeExecution?: Execution;
};

type Step = "label" | "config" | "classify" | "check" | "progress";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isFolderBlock(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    && ("path" in v || Object.keys(v).some(k => k.toLowerCase().startsWith("file")));
}

function getFolderFileEntries(block: Record<string, any>): Array<{ key: string; value: string }> {
  return Object.entries(block)
    .filter(([k]) => k.toLowerCase().startsWith("file") && k.toLowerCase() !== "files number")
    .map(([key, value]) => ({ key, value: String(value ?? "") }));
}
function looksLikeDate(key: string, value: any): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "");
  const dateKeywords = ["date", "from", "to", "start", "end", "period", "month", "year", "since", "until"];
  return dateKeywords.some(kw => k.includes(kw));
}

function DateConfigField({ fieldKey, currentVal, baseVal, isChanged, onChange, onReset }: {
  fieldKey: string; currentVal: string; baseVal: string; isChanged: boolean;
  onChange: (v: string) => void; onReset: () => void;
}) {
  // Quick-pick shortcuts for common ETL patterns
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().split("T")[0];
  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toISOString().split("T")[0];
  const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
    .toISOString().split("T")[0];

  return (
    <div style={{
      padding: "10px 12px", borderRadius: T.r,
      border: `1px solid ${isChanged ? "#f59e0b55" : T.border}`,
      background: isChanged ? T.warnBg : T.surface,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.textMid, fontWeight: 600 }}>{fieldKey}</span>
          <Chip color="#0891b2">date</Chip>
        </div>
        {isChanged && (
          <button onClick={onReset} style={{ fontSize: 11, color: T.textMuted, background: "none", border: "none", cursor: "pointer" }}>
            ↺ reset
          </button>
        )}
      </div>
      <input
        type="date"
        value={currentVal}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, background: isChanged ? "#fff" : T.inputBg }}
      />
      {/* Shortcuts */}
      <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
        {[
          { label: "Today", val: today.toISOString().split("T")[0] },
          { label: "1st this month", val: firstOfMonth },
          { label: "1st last month", val: firstOfLastMonth },
          { label: "End last month", val: lastOfLastMonth },
        ].map(s => (
          <button key={s.label} onClick={() => onChange(s.val)} style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 4,
            border: `1px solid ${T.border}`, background: "#fff",
            color: T.textMid, cursor: "pointer",
          }}>
            {s.label}
          </button>
        ))}
      </div>
      {isChanged && (
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
          Default: <code style={{ fontFamily: T.mono }}>{baseVal || "(empty)"}</code>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────

const T = {
  bg: "#ffffff", surface: "#f8fafc", border: "#e2e8f0",
  text: "#0f172a", textMid: "#475569", textMuted: "#94a3b8",
  accent: "#2563eb", accentBg: "#eff6ff", accentBorder: "#93c5fd",
  success: "#16a34a", successBg: "#f0fdf4", successBorder: "#86efac",
  warn: "#b45309", warnBg: "#fffbeb", warnBorder: "#fde68a",
  danger: "#dc2626", dangerBg: "#fef2f2", dangerBorder: "#fca5a5",
  purple: "#7c3aed", purpleBg: "#f5f3ff", purpleBorder: "#ddd6fe",
  inputBg: "#f1f5f9", r: "8px", rLg: "12px",
  mono: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: T.r,
  border: `1px solid ${T.border}`, background: T.inputBg, color: T.text,
  fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", outline: "none",
};

// ─────────────────────────────────────────────────────────────
// LaunchModal
// ─────────────────────────────────────────────────────────────

function LaunchModal({ etl, onClose, onDone, onCreateExecution, onLaunch, resumeExecution }: Props) {
  const [label, setLabel] = useState(`${etl.name} — ${new Date().toLocaleDateString()}`);
  const [step, setStep] = useState<Step>(resumeExecution ? "config" : "label");
  const [execution, setExecution] = useState<Execution | null>(resumeExecution ?? null);
  const [prepareData, setPrepareData] = useState<PrepareData | null>(null);
  const [loading, setLoading] = useState(!!resumeExecution);
  const [err, setErr] = useState<string | null>(null);
  const [cancellingExec, setCancellingExec] = useState(false);
  // A resumed execution already existed before this modal opened — closing
  // out of the wizard must NOT delete it, unlike a draft this modal created.
  const isResumed = !!resumeExecution;

  // Config step state
  // For simple keys: string overrides
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // For folder-block keys: full edited block object
  const [folderOverrides, setFolderOverrides] = useState<Record<string, Record<string, any>>>({});
  const [saveAsDefault, setSaveAsDefault] = useState<Record<string, boolean>>({});
  const [outputDelivery, setOutputDelivery] = useState<OutputDelivery>("app");
  const [notifyEmail, setNotifyEmail] = useState("");

  // Classify + check state
  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  const [checkResults, setCheckResults] = useState<CheckResults | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<"sample" | "stats">("sample");

  // Close modal and delete the execution if it was never launched — but
  // never auto-delete a resumed (pre-existing) execution, e.g. a scheduled
  // run the user is just reviewing; only drafts created by this modal.
  async function handleClose() {
    if (!isResumed && execution && ["PENDING", "VALIDATED"].includes(execution.status)) {
      try { await deleteExecution(execution.id); } catch { /* silent */ }
    }
    onClose();
  }

  // Resuming an existing execution — load its prepare data instead of
  // going through the "create a new execution" step.
  useEffect(() => {
    if (!resumeExecution) return;
    (async () => {
      try {
        setLoading(true); setErr(null);
        const data: PrepareData = await prepareExecution(resumeExecution.id);
        setPrepareData(data);
        setOutputDelivery(data.output_delivery || "app");
        setNotifyEmail(data.notify_email || "");
        setClassifications(
          Object.fromEntries(
            Object.entries(data.path_classifications).map(([k, v]) => [k, v as Classification])
          )
        );
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeExecution?.id]);

  // Auto-refresh while running
  useEffect(() => {
    if (!execution || !["PENDING", "INSTALLING_DEPS", "RUNNING"].includes(execution.status)) return;
    const id = setInterval(async () => {
      try {
        const updated = await apiFetch(`/executions/${execution.id}/`);
        setExecution(updated);
        if (["SUCCESS", "FAILED"].includes(updated.status)) {
          clearInterval(id);
          setTimeout(() => { onDone(); onClose(); }, 3000);
        }
      } catch (e) { console.error(e); }
    }, 2000);
    return () => clearInterval(id);
  }, [execution?.id, execution?.status]);

  // ── Step 1: Create execution ──────────────────────────────────────
  async function handleCreateExecution() {
    try {
      setLoading(true); setErr(null);
      const exec = await onCreateExecution(etl.id, label);
      setExecution(exec);
      const data: PrepareData = await prepareExecution(exec.id);
      setPrepareData(data);
      setOverrides({});
      setFolderOverrides({});
      setSaveAsDefault({});
      setOutputDelivery(data.output_delivery || "app");
      setNotifyEmail(data.notify_email || "");
      setClassifications(
        Object.fromEntries(
          Object.entries(data.path_classifications).map(([k, v]) => [k, v as Classification])
        )
      );
      setStep("config");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  // ── Step 2: Save config → classify ───────────────────────────────
  async function handleConfigConfirm() {
    if (!execution || !prepareData) return;
    try {
      setLoading(true); setErr(null);
      const etlConfig = prepareData.etl_config;

      // Simple key overrides (only changed values)
      const cleanOverrides: Record<string, any> = {};
      Object.entries(overrides).forEach(([k, v]) => {
        if (v.trim() !== "" && v !== String(etlConfig[k] ?? "")) cleanOverrides[k] = v;
      });

      // Folder-block overrides (the full edited block)
      Object.entries(folderOverrides).forEach(([k, block]) => {
        cleanOverrides[k] = block;
      });

      // Save as ETL default (admin only)
      const defaultsToSave: Record<string, any> = {};
      Object.entries(saveAsDefault).forEach(([k, save]) => {
        if (save && cleanOverrides[k] !== undefined) defaultsToSave[k] = cleanOverrides[k];
      });
      if (Object.keys(defaultsToSave).length > 0 && (etl as any).is_admin_user) {
        await apiFetch(`/etls/${etl.id}/update_base_config/`, {
          method: "POST", body: JSON.stringify({ config: defaultsToSave }),
        });
      }

      await updateExecutionConfig(execution.id, {
        overrides: cleanOverrides,
        output_delivery: outputDelivery,
        notify_email: outputDelivery !== "app" ? notifyEmail : "",
      });

      const fresh: PrepareData = await prepareExecution(execution.id);
      setPrepareData(fresh);
      setClassifications(prev => {
        const next = { ...prev };
        Object.keys(fresh.path_like_keys).forEach(k => { if (!(k in next)) next[k] = "skip"; });
        return next;
      });
      setStep("classify");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  // ── Step 3: Save classifications → run checks ─────────────────────
  async function handleClassifyConfirm(saveToEtl: boolean) {
    if (!execution) return;
    try {
      setCheckLoading(true); setErr(null);
      const results: CheckResults = await apiFetch(
        `/executions/${execution.id}/save_path_classifications/`,
        { method: "POST", body: JSON.stringify({ classifications, save_to_etl: saveToEtl }) }
      );
      setCheckResults(results);
      setActivePreviewTab("sample");
      setStep("check");
    } catch (e: any) { setErr(e.message); }
    finally { setCheckLoading(false); }
  }

  // ── Step 4: Launch ────────────────────────────────────────────────
  async function handleLaunch() {
    if (!execution) return;
    try {
      setLoading(true); setErr(null);
      setStep("progress");
      await onLaunch(execution.id);
      const updated = await apiFetch(`/executions/${execution.id}/`);
      setExecution(updated);
    } catch (e: any) { setErr(e.message); setStep("check"); }
    finally { setLoading(false); }
  }

  // Cancel directly from the progress view — no need to leave the modal
  async function handleCancelFromProgress() {
    if (!execution) return;
    if (!confirm("Cancel this execution?")) return;
    try {
      setCancellingExec(true); setErr(null);
      const updated = await cancelExecution(execution.id);
      setExecution(updated);
    } catch (e: any) { setErr(e.message); }
    finally { setCancellingExec(false); }
  }

  async function handleRefreshCheck() {
    if (!execution) return;
    setCheckLoading(true);
    try {
      const results: CheckResults = await apiFetch(`/executions/${execution.id}/check_paths/`);
      setCheckResults(results);
    } catch (e: any) { setErr(e.message); }
    finally { setCheckLoading(false); }
  }

  // ── RESUMING (loading an existing execution's data) ────────────────
  if (resumeExecution && step === "config" && !prepareData) {
    return (
      <ModalShell onClose={handleClose} title="Loading run…" subtitle={etl.name}>
        <div style={{ padding: "30px 0", textAlign: "center", color: T.textMuted, fontSize: 13 }}>
          {err ? <ErrorBox>{err}</ErrorBox> : "Loading configuration…"}
        </div>
      </ModalShell>
    );
  }

  // ── PROGRESS ──────────────────────────────────────────────────────
  if (step === "progress" && execution) {
    // This is always the current user's own launch — they can always cancel it.
    const cancellableNow = ["PENDING", "VALIDATED", "INSTALLING_DEPS", "RUNNING"].includes(execution.status);
    return (
      <ModalShell onClose={onClose} title="Running ETL" subtitle={execution.execution_label || etl.name}>
        <ExecutionProgress execution={execution} />
        {cancellableNow && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              onClick={handleCancelFromProgress}
              disabled={cancellingExec}
              style={{
                padding: "8px 16px", borderRadius: T.r, fontSize: 13, fontWeight: 600,
                border: `1px solid ${T.dangerBorder}`, background: T.dangerBg,
                color: T.danger, cursor: cancellingExec ? "not-allowed" : "pointer",
              }}
            >
              {cancellingExec ? "Cancelling…" : "✕ Cancel execution"}
            </button>
          </div>
        )}
        {["SUCCESS", "FAILED", "CANCELLED"].includes(execution.status) && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <Button onClick={() => { onDone(); onClose(); }}>Close & view results</Button>
          </div>
        )}
        {err && <ErrorBox>{err}</ErrorBox>}
      </ModalShell>
    );
  }

  // ── CHECK RESULTS ─────────────────────────────────────────────────
  if (step === "check" && checkResults) {
    return (
      <ModalShell
        onClose={handleClose} title="Path check"
        subtitle={execution?.execution_label || etl.name}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <GhostBtn onClick={() => setStep("classify")} disabled={loading}>← Re-classify</GhostBtn>
              <GhostBtn onClick={handleRefreshCheck} disabled={checkLoading}>
                {checkLoading ? "…" : "↻ Recheck"}
              </GhostBtn>
            </div>
            <Button onClick={handleLaunch} disabled={loading}>
              {loading ? "Launching…" : checkResults.inputs_accessible ? "▶ Launch ETL" : "▶ Launch anyway"}
            </Button>
          </div>
        }
      >
        <CheckResultsView
          results={checkResults} expandedKey={expandedKey}
          onToggleExpand={setExpandedKey} activeTab={activePreviewTab} onTabChange={setActivePreviewTab}
        />
        {err && <ErrorBox>{err}</ErrorBox>}
      </ModalShell>
    );
  }

  // ── CLASSIFY ──────────────────────────────────────────────────────
  if (step === "classify" && prepareData) {
    const keys = Object.keys(prepareData.path_like_keys);
    return (
      <ModalShell
        onClose={handleClose} title="Classify paths"
        subtitle={`${keys.length} path${keys.length !== 1 ? "s" : ""} detected in config`}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <GhostBtn onClick={() => setStep("config")} disabled={checkLoading}>← Back</GhostBtn>
            <div style={{ display: "flex", gap: 8 }}>
              {(etl as any).is_admin_user && (
                <GhostBtn onClick={() => handleClassifyConfirm(true)} disabled={checkLoading}
                  title="Save classifications to the ETL for all future users">
                  {checkLoading ? "…" : "Check & save to ETL"}
                </GhostBtn>
              )}
              <Button onClick={() => handleClassifyConfirm(false)} disabled={checkLoading}>
                {checkLoading ? "Checking…" : "Check paths →"}
              </Button>
            </div>
          </div>
        }
      >
        {keys.length === 0
          ? <InfoBox>No path-like values detected. You can launch directly.</InfoBox>
          : (
            <>
             <p style={{ fontSize: 12, color: T.textMuted, margin: "0 0 14px" }}>
  Label each path as <strong>Input</strong> (ETL reads from it),{" "}
  <strong>Output</strong> (ETL writes to it), or <strong>Skip</strong> (ignore).
  <br />
  <span style={{ color: T.warn }}>
    Short names like <code>logs</code>, <code>outputs</code>, <code>deleted</code> are
    typically <strong>Output</strong> folders.
  </span>
</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {keys.map(key => {
                  const rawVal = (prepareData.execution_config || prepareData.etl_config)[key];
                  return (
                    <PathClassifyRow
                      key={key}
                      configKey={key}
                      rawValue={prepareData.path_like_keys[key]}
                      isFolderBlock={isFolderBlock(rawVal)}
                      classification={classifications[key] || "skip"}
                      onChange={val => setClassifications(prev => ({ ...prev, [key]: val }))}
                    />
                  );
                })}
              </div>
            </>
          )
        }
        {err && <ErrorBox>{err}</ErrorBox>}
      </ModalShell>
    );
  }

  // ── CONFIG ────────────────────────────────────────────────────────
  if (step === "config" && execution && prepareData) {
    const etlConfig = prepareData.etl_config || {};
    const allKeys = Object.keys(etlConfig).filter(k => !["input_requirements", "expected_outputs"].includes(k));
    const folderKeys = allKeys.filter(k => isFolderBlock(etlConfig[k]));
    const simpleKeys = allKeys.filter(k => !isFolderBlock(etlConfig[k]));

    const changedSimple = simpleKeys.filter(
      k => overrides[k] !== undefined && overrides[k] !== String(etlConfig[k] ?? "")
    ).length;
    const changedFolders = Object.keys(folderOverrides).length;

    return (
      <ModalShell
        onClose={handleClose} title="Configure run"
        subtitle={prepareData.config_file_path ? `Config: ${prepareData.config_file_path}` : etl.name}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <GhostBtn onClick={() => setStep("label")} disabled={loading}>← Back</GhostBtn>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {(changedSimple + changedFolders) > 0 && (
                <span style={{ fontSize: 12, color: T.accent }}>
                  {changedSimple + changedFolders} change{changedSimple + changedFolders !== 1 ? "s" : ""}
                </span>
              )}
              <Button onClick={handleConfigConfirm} disabled={loading}>
                {loading ? "Saving…" : "Next: classify paths →"}
              </Button>
            </div>
          </div>
        }
      >
        {allKeys.length === 0
          ? <InfoBox>No config file — ETL will run with default settings.</InfoBox>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: T.textMuted, margin: "0 0 4px" }}>
                Edit any value for this run. For folder blocks, update path, file count, and file names.
                Check <em>Save as default</em> to update the ETL's base config.
              </p>

              {/* Folder blocks — fully editable */}
              {folderKeys.map(key => (
                <FolderBlockEditor
                  key={key}
                  fieldKey={key}
                  block={folderOverrides[key] ?? etlConfig[key]}
                  isAdmin={!!(etl as any).is_admin_user}
                  saveAsDefault={!!saveAsDefault[key]}
                  onBlockChange={updated => setFolderOverrides(prev => ({ ...prev, [key]: updated }))}
                  onToggleSaveAsDefault={v => setSaveAsDefault(prev => ({ ...prev, [key]: v }))}
                />
              ))}

              {/* Simple keys */}
           {simpleKeys.map(key => {
  const baseVal    = String(etlConfig[key] ?? "");
  const currentVal = overrides[key] !== undefined ? overrides[key] : baseVal;
  const isChanged  = currentVal !== baseVal;

  // Date fields get their own picker
  if (looksLikeDate(key, etlConfig[key])) {
    return (
      <DateConfigField
        key={key} fieldKey={key} currentVal={currentVal} baseVal={baseVal}
        isChanged={isChanged}
        onChange={v => setOverrides(prev => ({ ...prev, [key]: v }))}
        onReset={() => setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; })}
      />
    );
  }

  return (
    <ConfigField
      key={key} fieldKey={key} currentVal={currentVal} baseVal={baseVal}
      isChanged={isChanged} saveAsDefault={!!saveAsDefault[key]}
      isAdmin={!!(etl as any).is_admin_user}
      onChange={v => setOverrides(prev => ({ ...prev, [key]: v }))}
      onReset={() => setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; })}
      onToggleSaveAsDefault={v => setSaveAsDefault(prev => ({ ...prev, [key]: v }))}
    />
  );
})}
            </div>
          )
        }
        <DeliveryPicker
          outputDelivery={outputDelivery} notifyEmail={notifyEmail}
          onChangeDelivery={setOutputDelivery} onChangeEmail={setNotifyEmail}
        />
        {err && <ErrorBox>{err}</ErrorBox>}
      </ModalShell>
    );
  }

  // ── LABEL ─────────────────────────────────────────────────────────
  return (
    <ModalShell
      onClose={handleClose} title="Launch ETL" subtitle={`${etl.name} v${etl.version}`}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <GhostBtn onClick={handleClose}>Cancel</GhostBtn>
          <Button disabled={loading || !label.trim()} onClick={handleCreateExecution}>
            {loading ? "Creating…" : "Next →"}
          </Button>
        </div>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 6 }}>
          Execution label
        </label>
        <input value={label} onChange={e => setLabel(e.target.value)}
          style={inputStyle} placeholder="Give this run a name…" autoFocus />
      </div>
      <StepPreview />
      {err && <ErrorBox>{err}</ErrorBox>}
    </ModalShell>
  );
}

export default LaunchModal;

// ─────────────────────────────────────────────────────────────
// FolderBlockEditor — fully editable, shown in config step
// ─────────────────────────────────────────────────────────────

function FolderBlockEditor({
  fieldKey, block, isAdmin, saveAsDefault, onBlockChange, onToggleSaveAsDefault,
}: {
  fieldKey: string;
  block: Record<string, any>;
  isAdmin: boolean;
  saveAsDefault: boolean;
  onBlockChange: (updated: Record<string, any>) => void;
  onToggleSaveAsDefault: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(true);

  // local copy so we can edit freely
  const [local, setLocal] = useState<Record<string, any>>({ ...block });

  function update(key: string, value: any) {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    onBlockChange(updated);
  }

  function addFileEntry() {
    // Find next available fileN key
    const existing = Object.keys(local).filter(k => /^file\d+$/i.test(k));
    const nums = existing.map(k => parseInt(k.replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    update(`file${next}`, "-");
  }

  function removeFileEntry(key: string) {
    const updated = { ...local };
    delete updated[key];
    setLocal(updated);
    onBlockChange(updated);
  }

  const fileEntries = getFolderFileEntries(local);
  const placeholderCount = fileEntries.filter(e => e.value === "-" || e.value === "").length;
  const filesNumber = local["files number"];

  return (
    <div style={{
      borderRadius: T.r,
      border: `1px solid ${placeholderCount > 0 ? T.warnBorder : T.purpleBorder}`,
      background: placeholderCount > 0 ? T.warnBg : T.purpleBg,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.text }}>{fieldKey}</span>
            <Chip color={T.purple}>folder block</Chip>
            {filesNumber != null && <Chip color={T.accent}>{filesNumber} files expected</Chip>}
            {placeholderCount > 0 && <Chip color={T.warn}>{placeholderCount} unset</Chip>}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {local.path || "no path set"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {isAdmin && (
            <label onClick={e => e.stopPropagation()}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.purple, cursor: "pointer" }}>
              <input type="checkbox" checked={saveAsDefault}
                onChange={e => onToggleSaveAsDefault(e.target.checked)} style={{ margin: 0 }} />
              Save as default
            </label>
          )}
          <span style={{ fontSize: 11, color: T.textMuted }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>

          {/* Path */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 3 }}>path</label>
            <input
              value={String(local.path ?? "")}
              onChange={e => update("path", e.target.value)}
              style={inputStyle}
              placeholder="data/my-folder/"
            />
          </div>

          {/* Files number */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 3 }}>
              files number <span style={{ fontWeight: 400, color: T.textMuted }}>(expected file count, optional)</span>
            </label>
            <input
              value={local["files number"] != null ? String(local["files number"]) : ""}
              onChange={e => {
                const v = e.target.value.trim();
                update("files number", v === "" ? null : parseInt(v, 10) || null);
              }}
              style={inputStyle}
              placeholder="leave blank if unknown"
              type="number"
              min={0}
            />
          </div>
          {/* Check mode */}
<div>
  <label style={{ fontSize: 11, fontWeight: 600, color: T.textMid, display: "block", marginBottom: 3 }}>
    check_mode{" "}
    <span style={{ fontWeight: 400, color: T.textMuted }}>
      — how to verify this folder
    </span>
  </label>
  <select
    value={String(local["check_mode"] ?? "auto")}
    onChange={e => update("check_mode", e.target.value)}
    style={{ ...inputStyle, cursor: "pointer" }}
  >
    <option value="auto">auto — system decides</option>
    <option value="count">count — only verify total file count</option>
    <option value="files">files — only verify each named file exists</option>
    <option value="both">both — verify count AND each named file</option>
  </select>
  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>
    {local["check_mode"] === "count" && "Will only check that the folder contains the expected number of files."}
    {local["check_mode"] === "files" && "Will check each file1/file2/… entry exists. File count is ignored."}
    {local["check_mode"] === "both" && "Will check both file count AND each named file."}
    {(!local["check_mode"] || local["check_mode"] === "auto") &&
      "Auto: uses 'files' if fileN entries exist, 'count' if only a number is given."}
  </div>
</div>
          {/* File entries */}
          {fileEntries.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>
                File names / patterns
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {fileEntries.map(({ key, value }) => {
                  const isPlaceholder = value === "-" || value === "";
                  const isWildcard    = value.includes("*");
                  return (
                    <div key={key} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", borderRadius: 6,
                      border: `1px solid ${isPlaceholder ? T.warnBorder : T.border}`,
                      background: isPlaceholder ? T.warnBg : T.surface,
                    }}>
                      <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.textMid, flexShrink: 0, minWidth: 48 }}>
                        {key}
                      </span>
                      <input
                        value={isPlaceholder ? "" : value}
                        onChange={e => update(key, e.target.value || "-")}
                        placeholder="filename or pattern like report*.xlsx"
                        style={{
                          flex: 1, padding: "5px 8px", borderRadius: 5,
                          border: `1px solid ${isPlaceholder ? T.warnBorder : T.border}`,
                          background: "#fff", color: T.text, fontSize: 11,
                          fontFamily: T.mono, outline: "none",
                        }}
                      />
                      {isWildcard    && <Chip color={T.accent}>wildcard</Chip>}
                      {isPlaceholder && <Chip color={T.warn}>unset</Chip>}
                      <button
                        onClick={() => removeFileEntry(key)}
                        title="Remove this file entry"
                        style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 14, padding: "0 2px", flexShrink: 0 }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add file entry button */}
          <button
            onClick={addFileEntry}
            style={{
              alignSelf: "flex-start", padding: "5px 12px", borderRadius: 6,
              border: `1px dashed ${T.purpleBorder}`, background: T.purpleBg,
              color: T.purple, fontSize: 11, cursor: "pointer", fontWeight: 600,
            }}
          >
            + Add file entry
          </button>

          {placeholderCount > 0 && (
            <div style={{ padding: "6px 10px", borderRadius: 6, background: T.warnBg, border: `1px solid ${T.warnBorder}`, fontSize: 11, color: T.warn }}>
              ⚠ {placeholderCount} file entr{placeholderCount === 1 ? "y is" : "ies are"} not configured yet.
              Fill them in above, or leave as <code style={{ fontFamily: T.mono }}>-</code> — they will
              show as warnings during path check but won't block launch.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ConfigField — simple key editor
// ─────────────────────────────────────────────────────────────

function ConfigField({
  fieldKey, currentVal, baseVal, isChanged, saveAsDefault, isAdmin,
  onChange, onReset, onToggleSaveAsDefault,
}: {
  fieldKey: string; currentVal: string; baseVal: string; isChanged: boolean;
  saveAsDefault: boolean; isAdmin: boolean; onChange: (v: string) => void;
  onReset: () => void; onToggleSaveAsDefault: (v: boolean) => void;
}) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: T.r,
      border: `1px solid ${isChanged ? T.accentBorder : T.border}`,
      background: isChanged ? T.accentBg : T.surface, transition: "all .15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.textMid, fontWeight: 600 }}>{fieldKey}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isChanged && isAdmin && (
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.accent, cursor: "pointer" }}>
              <input type="checkbox" checked={saveAsDefault} onChange={e => onToggleSaveAsDefault(e.target.checked)} style={{ margin: 0 }} />
              Save as default
            </label>
          )}
          {isChanged && (
            <button onClick={onReset} style={{ fontSize: 11, color: T.textMuted, background: "none", border: "none", cursor: "pointer", padding: "1px 4px" }}>
              ↺ reset
            </button>
          )}
        </div>
      </div>
      <input value={currentVal} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, background: isChanged ? "#fff" : T.inputBg }} />
      {isChanged && (
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
          Default: <code style={{ fontFamily: T.mono }}>{baseVal || "(empty)"}</code>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PathClassifyRow — classify step (simple: just Input/Output/Skip)
// ─────────────────────────────────────────────────────────────

function PathClassifyRow({ configKey, rawValue, isFolderBlock: isFolder, classification, onChange }: {
  configKey: string; rawValue: string; isFolderBlock: boolean;
  classification: Classification; onChange: (v: Classification) => void;
}) {
  const opts = [
    { value: "input"  as Classification, label: "Input",  color: T.success, bg: T.successBg },
    { value: "output" as Classification, label: "Output", color: T.accent,  bg: T.accentBg },
    { value: "skip"   as Classification, label: "Skip",   color: T.textMuted, bg: T.surface },
  ];
  const chosen = opts.find(o => o.value === classification) || opts[2];

  return (
    <div style={{
      padding: "10px 12px", borderRadius: T.r,
      border: `1px solid ${classification === "skip" ? T.border : chosen.color + "55"}`,
      background: classification === "skip" ? T.surface : chosen.bg,
      transition: "all .12s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono, color: T.text }}>{configKey}</span>
            {isFolder && <Chip color={T.purple}>folder block</Chip>}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rawValue}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {opts.map(opt => (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
              border: `1px solid ${classification === opt.value ? opt.color : T.border}`,
              background: classification === opt.value ? opt.bg : "#fff",
              color: classification === opt.value ? opt.color : T.textMuted,
              fontWeight: classification === opt.value ? 600 : 400,
              transition: "all .12s",
            }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CheckResultsView
// ─────────────────────────────────────────────────────────────

function CheckResultsView({ results, expandedKey, onToggleExpand, activeTab, onTabChange }: {
  results: CheckResults; expandedKey: string | null; onToggleExpand: (k: string | null) => void;
  activeTab: "sample" | "stats"; onTabChange: (t: "sample" | "stats") => void;
}) {
  const { inputs, outputs, other, inputs_accessible, inputs_missing, unclassified_path_keys } = results;
  return (
    <div>
      {inputs.length > 0 && (
        <div style={{
          padding: "10px 14px", borderRadius: T.r, marginBottom: 14,
          background: inputs_accessible ? T.successBg : T.warnBg,
          border: `1px solid ${inputs_accessible ? T.successBorder : T.warnBorder}`,
          fontSize: 13, color: inputs_accessible ? T.success : T.warn,
        }}>
          {inputs_accessible
            ? `✓ All ${inputs.length} input${inputs.length !== 1 ? "s" : ""} accessible`
            : `⚠ ${inputs_missing.length} input${inputs_missing.length !== 1 ? "s" : ""} not reachable: ${inputs_missing.join(", ")}`}
        </div>
      )}
      {unclassified_path_keys.length > 0 && (
        <div style={{ padding: "8px 12px", borderRadius: T.r, marginBottom: 12, background: T.warnBg, border: `1px solid ${T.warnBorder}`, fontSize: 12, color: T.warn }}>
          {unclassified_path_keys.length} key(s) not classified:{" "}
          <code style={{ fontFamily: T.mono }}>{unclassified_path_keys.join(", ")}</code>
        </div>
      )}
      {inputs.length > 0 && <PathSection title="Inputs" color={T.success} entries={inputs} expandedKey={expandedKey} onToggle={onToggleExpand} activeTab={activeTab} onTabChange={onTabChange} />}
      {outputs.length > 0 && <PathSection title="Outputs" color={T.accent} entries={outputs} expandedKey={expandedKey} onToggle={onToggleExpand} activeTab={activeTab} onTabChange={onTabChange} />}
      {other.length > 0 && <PathSection title="Other" color={T.textMuted} entries={other} expandedKey={expandedKey} onToggle={onToggleExpand} activeTab={activeTab} onTabChange={onTabChange} />}
      {inputs.length === 0 && outputs.length === 0 && other.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 13 }}>No paths to check — all keys were skipped.</div>
      )}
    </div>
  );
}

function PathSection({ title, color, entries, expandedKey, onToggle, activeTab, onTabChange }: {
  title: string; color: string; entries: PathEntry[];
  expandedKey: string | null; onToggle: (k: string | null) => void;
  activeTab: "sample" | "stats"; onTabChange: (t: "sample" | "stats") => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        {title}
        <span style={{ fontSize: 10, background: color + "22", color, padding: "1px 6px", borderRadius: 99, fontWeight: 600 }}>{entries.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(e => (
          <PathResultCard key={e.config_key} entry={e}
            expanded={expandedKey === e.config_key}
            onToggle={() => onToggle(expandedKey === e.config_key ? null : e.config_key)}
            activeTab={activeTab} onTabChange={onTabChange} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PathResultCard
// ─────────────────────────────────────────────────────────────

function PathResultCard({ entry, expanded, onToggle, activeTab, onTabChange }: {
  entry: PathEntry; expanded: boolean; onToggle: () => void;
  activeTab: "sample" | "stats"; onTabChange: (t: "sample" | "stats") => void;
}) {
  const isFolderEntry = Array.isArray(entry.file_checks);
  const hasPlainPreview = !isFolderEntry && !!(entry.dataframe_preview && !entry.dataframe_preview.error && !entry.dataframe_preview.skipped);
  const isClickable = isFolderEntry || hasPlainPreview;
  const hasWarnings = (entry.warnings ?? []).length > 0;

  const classColor  = entry.classification === "input" ? T.success : entry.classification === "output" ? T.accent : T.textMuted;
  const dotColor    = entry.accessible ? T.success : hasWarnings ? T.warn : T.danger;
  const borderColor = !entry.accessible && !hasWarnings ? T.dangerBorder : hasWarnings ? T.warnBorder : T.border;
  const bgColor     = !entry.accessible && !hasWarnings ? T.dangerBg   : hasWarnings ? T.warnBg   : "#fff";

  return (
    <div style={{ borderRadius: T.r, border: `1px solid ${borderColor}`, background: bgColor, overflow: "hidden" }}>
      <div
        style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: isClickable ? "pointer" : "default" }}
        onClick={isClickable ? onToggle : undefined}
      >
        <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: dotColor }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono, color: T.text }}>{entry.config_key}</span>
            <Chip color={classColor}>{entry.classification}</Chip>
            {isFolderEntry && <Chip color={T.purple}>folder</Chip>}
            {!isFolderEntry && entry.extension && <Chip color={T.textMid}>{entry.extension}</Chip>}
            {!isFolderEntry && entry.path_type && (
              <Chip color={entry.path_type === "absolute" ? T.purple : "#0369a1"}>
                {entry.path_type === "absolute" ? "local" : "in zip"}
              </Chip>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.path || entry.raw_path || "—"}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {entry.accessible && entry.size_display && <div style={{ fontSize: 12, color: T.textMid }}>{entry.size_display}</div>}
          {entry.accessible && entry.is_dir && entry.files_in_dir != null && (
            <div style={{ fontSize: 11, color: T.textMuted }}>{entry.files_in_dir} files</div>
          )}
          {entry.accessible && entry.last_modified && (
            <div style={{ fontSize: 11, color: T.textMuted }}>{new Date(entry.last_modified).toLocaleDateString()}</div>
          )}
          {!entry.accessible && !hasWarnings && <div style={{ fontSize: 11, color: T.danger }}>Not found</div>}
          {hasWarnings && <div style={{ fontSize: 11, color: T.warn }}>⚠ warnings</div>}
          {isClickable && <div style={{ fontSize: 11, color: T.accent, marginTop: 2 }}>{expanded ? "▲ hide" : "▼ details"}</div>}
        </div>
      </div>

      {/* Plain path issue */}
      {entry.issue && !isFolderEntry && (
        <div style={{
          padding: "6px 12px",
          background: entry.is_placeholder ? T.warnBg : T.dangerBg,
          borderTop: `1px solid ${entry.is_placeholder ? T.warnBorder : T.dangerBorder}`,
          fontSize: 11, color: entry.is_placeholder ? T.warn : T.danger,
        }}>
          {entry.issue}
        </div>
      )}

      {/* Folder block detail */}
      {isFolderEntry && expanded && (
        <FolderBlockDetail entry={entry} activeTab={activeTab} onTabChange={onTabChange} />
      )}

      {/* Plain file preview */}
      {!isFolderEntry && expanded && entry.dataframe_preview && (
        <DataframePreviewPanel preview={entry.dataframe_preview} activeTab={activeTab} onTabChange={onTabChange} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FolderBlockDetail — shown in check results
// ─────────────────────────────────────────────────────────────

function FolderBlockDetail({ entry, activeTab, onTabChange }: {
  entry: PathEntry; activeTab: "sample" | "stats"; onTabChange: (t: "sample" | "stats") => void;
}) {
  const { file_checks = [], file_count_check, warnings = [], folder_accessible, found_files } = entry;
  const [openPreviewIdx, setOpenPreviewIdx] = useState<number | null>(null);

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>

      {/* Folder not accessible */}
      {!folder_accessible && (
        <div style={{ padding: "8px 12px", background: T.dangerBg, borderBottom: `1px solid ${T.dangerBorder}`, fontSize: 12, color: T.danger }}>
          ✕ Folder not found or not accessible
        </div>
      )}

      {/* File count */}
      {file_count_check && (
        <div style={{
          padding: "8px 12px",
          background: file_count_check.ok ? T.successBg : T.warnBg,
          borderBottom: `1px solid ${file_count_check.ok ? T.successBorder : T.warnBorder}`,
          fontSize: 12, color: file_count_check.ok ? T.success : T.warn,
        }}>
          {file_count_check.ok
            ? `✓ File count OK — ${file_count_check.actual} file(s) found (expected ${file_count_check.declared})`
            : `⚠ Expected ${file_count_check.declared} file(s), found ${file_count_check.actual}`}
        </div>
      )}

      {/* Per-file checks */}
      {file_checks.length > 0 && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.textMid, marginBottom: 2 }}>
            Files
          </div>
          {file_checks.map((fc, i) => {
            if (fc.is_placeholder) {
              return (
                <div key={i} style={{
                  padding: "7px 10px", borderRadius: 6,
                  background: T.warnBg, border: `1px solid ${T.warnBorder}`,
                  fontSize: 11, color: T.warn, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontFamily: T.mono, fontWeight: 700 }}>—</span>
                  <span><strong>{fc.key}</strong>: not configured. Fill it in if this file is required.</span>
                </div>
              );
            }

            const hasFilePreview = !!(fc.dataframe_preview && !fc.dataframe_preview.error && !fc.dataframe_preview.skipped);
            const isOpen = openPreviewIdx === i;

            return (
              <div key={i} style={{ borderRadius: 6, border: `1px solid ${fc.ok ? T.border : T.dangerBorder}`, background: fc.ok ? "#fff" : T.dangerBg, overflow: "hidden" }}>
                <div
                  style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 8, cursor: hasFilePreview ? "pointer" : "default" }}
                  onClick={hasFilePreview ? () => setOpenPreviewIdx(isOpen ? null : i) : undefined}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block", background: fc.ok ? T.success : T.danger }} />
                  <span style={{ fontFamily: T.mono, fontSize: 11, flex: 1, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: T.textMuted, marginRight: 4 }}>{fc.key}:</span>{fc.pattern}
                  </span>
                  {fc.is_wildcard && <Chip color={T.accent}>wildcard</Chip>}
                  <span style={{ fontSize: 11, flexShrink: 0, color: fc.ok ? T.success : T.danger }}>
                    {fc.ok ? (fc.is_wildcard ? `${fc.matched_files.length} match${fc.matched_files.length !== 1 ? "es" : ""}` : "found") : "not found"}
                  </span>
                  {hasFilePreview && <span style={{ fontSize: 11, color: T.accent }}>{isOpen ? "▲" : "▼"}</span>}
                </div>
                {fc.ok && fc.is_wildcard && fc.matched_files.length > 0 && (
                  <div style={{ padding: "3px 10px 8px 26px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {fc.matched_files.map(f => (
                      <span key={f} style={{ fontSize: 10, fontFamily: T.mono, padding: "1px 6px", borderRadius: 4, background: T.accentBg, color: T.accent }}>{f}</span>
                    ))}
                  </div>
                )}
                {!fc.ok && fc.warning && (
                  <div style={{ padding: "3px 10px 8px", fontSize: 11, color: T.danger }}>{fc.warning}</div>
                )}
                {isOpen && fc.dataframe_preview && (
                  <DataframePreviewPanel preview={fc.dataframe_preview} activeTab={activeTab} onTabChange={onTabChange} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Output folder: files found after execution */}
      {found_files && found_files.length > 0 && (
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.accent, marginBottom: 6 }}>
            Output files found
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {found_files.map(f => (
              <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, padding: "4px 8px", borderRadius: 5, background: T.accentBg, border: `1px solid ${T.accentBorder}` }}>
                <span style={{ fontFamily: T.mono, flex: 1, color: T.text }}>{f.name}</span>
                <Chip color={T.textMid}>{f.extension}</Chip>
                <span style={{ color: T.textMuted }}>{f.size_display}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings summary */}
      {warnings.length > 0 && (
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.warnBorder}`, background: T.warnBg, display: "flex", flexDirection: "column", gap: 3 }}>
          {warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: T.warn }}>⚠ {w}</div>)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DataframePreviewPanel
// ─────────────────────────────────────────────────────────────

function DataframePreviewPanel({ preview, activeTab, onTabChange }: {
  preview: DataframePreview; activeTab: "sample" | "stats"; onTabChange: (t: "sample" | "stats") => void;
}) {
  if (preview.error) return (
    <div style={{ padding: "10px 12px", background: T.dangerBg, borderTop: `1px solid ${T.dangerBorder}`, fontSize: 12, color: T.danger }}>
      Could not read: {preview.error}
    </div>
  );
  if (preview.skipped) return (
    <div style={{ padding: "10px 12px", background: T.surface, borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.textMuted }}>
      {preview.reason}
    </div>
  );

  const cols = preview.columns || [], rows = preview.sample_rows || [], stats = preview.col_stats || {};
  const hasStats = Object.keys(stats).length > 0;

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>
      <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: T.textMuted }}>
          <span><strong style={{ color: T.text }}>{cols.length}</strong> cols</span>
          {preview.row_count != null && <span><strong style={{ color: T.text }}>{preview.row_count.toLocaleString()}</strong> rows</span>}
        </div>
        {hasStats && (
          <div style={{ display: "flex", gap: 4 }}>
            {(["sample", "stats"] as const).map(tab => (
              <button key={tab} onClick={() => onTabChange(tab)} style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                border: `1px solid ${activeTab === tab ? T.accent : T.border}`,
                background: activeTab === tab ? T.accentBg : "#fff",
                color: activeTab === tab ? T.accent : T.textMuted,
                fontWeight: activeTab === tab ? 600 : 400,
              }}>
                {tab === "sample" ? "Sample" : "Stats"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ overflowX: "auto", maxHeight: 240 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
              <th style={TH}>Column</th>
              <th style={{ ...TH, color: T.textMuted, fontWeight: 500 }}>Type</th>
              {rows.map((_, i) => <th key={i} style={{ ...TH, color: T.textMuted, fontWeight: 400 }}>row {i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {cols.map((col, ci) => (
              <tr key={col} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ ...TD, fontFamily: T.mono, color: T.text, whiteSpace: "nowrap" }}>{col}</td>
                <td style={{ ...TD, color: T.textMuted, fontFamily: T.mono, fontSize: 10 }}>{preview.dtypes?.[col] || "—"}</td>
                {rows.map((row, ri) => (
                  <td key={ri} style={{ ...TD, color: T.textMuted, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TH: React.CSSProperties = { padding: "5px 10px", textAlign: "left", fontWeight: 600, color: T.textMid, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "4px 10px" };

// ─────────────────────────────────────────────────────────────
// DeliveryPicker
// ─────────────────────────────────────────────────────────────

function DeliveryPicker({ outputDelivery, notifyEmail, onChangeDelivery, onChangeEmail }: {
  outputDelivery: OutputDelivery; notifyEmail: string;
  onChangeDelivery: (v: OutputDelivery) => void; onChangeEmail: (v: string) => void;
}) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 8 }}>Send results to:</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["app", "email", "both"] as OutputDelivery[]).map(opt => (
          <button key={opt} onClick={() => onChangeDelivery(opt)} style={{
            padding: "6px 14px", borderRadius: T.r, fontSize: 13,
            border: `1px solid ${outputDelivery === opt ? T.accent : T.border}`,
            background: outputDelivery === opt ? T.accentBg : "#fff",
            color: outputDelivery === opt ? "#1e40af" : T.textMid,
            cursor: "pointer", fontWeight: outputDelivery === opt ? 600 : 400,
          }}>
            {opt === "app" ? "App only" : opt === "email" ? "Email only" : "App + email"}
          </button>
        ))}
      </div>
      {(outputDelivery === "email" || outputDelivery === "both") && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4 }}>Email address</label>
          <input type="email" value={notifyEmail} onChange={e => onChangeEmail(e.target.value)}
            placeholder="recipient@company.com" style={inputStyle} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ExecutionProgress
// ─────────────────────────────────────────────────────────────

function ExecutionProgress({ execution }: { execution: Execution }) {
  const isRunning = ["PENDING", "INSTALLING_DEPS", "RUNNING"].includes(execution.status);
  const isSuccess = execution.status === "SUCCESS";
  const isFailed  = execution.status === "FAILED";
  const statusColor  = isSuccess ? T.success : isFailed ? T.danger : T.accent;
  const statusBg     = isSuccess ? T.successBg : isFailed ? T.dangerBg : T.accentBg;
  const statusBorder = isSuccess ? T.successBorder : isFailed ? T.dangerBorder : T.accentBorder;
  const logLines     = (execution.stdout_log || "Starting…").split("\n").filter(l => l.trim());
  const recentLines  = logLines.slice(-8).join("\n");

  const steps = [
    { label: "Copy code",    done: execution.status !== "PENDING" },
    { label: "Write config", done: ["INSTALLING_DEPS","RUNNING","SUCCESS","FAILED"].includes(execution.status) },
    { label: "Venv",         done: ["RUNNING","SUCCESS","FAILED"].includes(execution.status) },
    { label: "Run",          done: ["SUCCESS","FAILED"].includes(execution.status) },
  ];

  return (
    <div>
      <div style={{ padding: "14px 16px", borderRadius: T.r, marginBottom: 14, background: statusBg, border: `1px solid ${statusBorder}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: statusColor, marginBottom: 4 }}>
          {isSuccess ? "Completed successfully ✓" : isFailed ? "Execution failed" : `${execution.status.replace(/_/g, " ")}…`}
        </div>
        {execution.started_at && (
          <div style={{ fontSize: 12, color: T.textMuted }}>
            Started {new Date(execution.started_at).toLocaleTimeString()}
            {execution.completed_at && (
              <> · {Math.round((new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()) / 1000)}s</>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", marginBottom: 14, background: T.surface, borderRadius: T.r, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        {steps.map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: "8px 4px", textAlign: "center",
            borderRight: i < steps.length - 1 ? `1px solid ${T.border}` : "none",
            background: s.done ? T.successBg : "transparent", transition: "background .3s",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.done ? T.success : T.textMuted }}>{s.done ? "✓ " : ""}{s.label}</div>
          </div>
        ))}
      </div>
      {isRunning && (
        <pre style={{ background: "#0f172a", color: "#94a3b8", borderRadius: T.r, padding: 12, fontSize: 11, fontFamily: T.mono, whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto", margin: 0 }}>
          {recentLines}
        </pre>
      )}
      {isFailed && execution.error_message && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: T.r, background: T.dangerBg, border: `1px solid ${T.dangerBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.danger, marginBottom: 4 }}>Error</div>
          <pre style={{ fontSize: 11, color: T.danger, fontFamily: T.mono, whiteSpace: "pre-wrap", margin: 0 }}>{execution.error_message}</pre>
        </div>
      )}
      {isSuccess && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: T.r, textAlign: "center", background: T.successBg, border: `1px solid ${T.successBorder}` }}>
          <div style={{ fontSize: 14, color: T.success, fontWeight: 700 }}>ETL completed</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shell & utilities
// ─────────────────────────────────────────────────────────────

function ModalShell({ children, onClose, title, subtitle, footer }: {
  children: React.ReactNode; onClose: () => void; title: string; subtitle?: string; footer?: React.ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)" }}>
      <div style={{ background: T.bg, borderRadius: T.rLg, width: "92%", maxWidth: 700, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.textMuted, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
        {footer && <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>{footer}</div>}
      </div>
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: color + "22", color, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: T.r, background: T.surface, border: `1px solid ${T.border}`, fontSize: 13, color: T.textMid }}>
      {children}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: T.r, background: T.dangerBg, color: T.danger, fontSize: 13, border: `1px solid ${T.dangerBorder}` }}>
      {children}
    </div>
  );
}

function GhostBtn({ children, onClick, disabled, title }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      padding: "7px 14px", borderRadius: T.r, fontSize: 13,
      border: `1px solid ${T.border}`, background: "transparent",
      color: disabled ? T.textMuted : T.textMid, cursor: disabled ? "not-allowed" : "pointer",
      fontWeight: 500, transition: "all .12s",
    }}>
      {children}
    </button>
  );
}

function StepPreview() {
  const steps = ["Edit config values (including folder blocks)", "Label each path: Input, Output, or Skip", "Auto-check all paths + manual recheck", "Launch"];
  return (
    <div style={{ padding: "12px 16px", borderRadius: T.r, background: T.accentBg, border: `1px solid ${T.accentBorder}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>What happens next</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3b82f6" }}>
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#2563eb", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}