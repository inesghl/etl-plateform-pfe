import React, { useState, useEffect, useCallback } from "react";
import { Etl } from "../../types/etl";
import { Execution, OutputDelivery } from "../../types/execution";
import { Button } from "../common/Button";
import { apiFetch } from "../../api/api";
import { prepareExecution, updateExecutionConfig } from "../../api/execution";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Classification = "input" | "output" | "skip";

type ColStat = {
  dtype: string;
  null_count: number;
  null_pct: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  std?: number | null;
  unique_count?: number;
  unique_values?: string[];
};

type DataframePreview = {
  columns?: string[];
  dtypes?: Record<string, string>;
  col_stats?: Record<string, ColStat>;
  row_count?: number | null;
  col_count?: number;
  sample_rows?: string[][];
  skipped?: boolean;
  reason?: string;
  error?: string;
};

type PathEntry = {
  config_key: string;
  path: string | null;
  raw_path?: string | null;
  accessible: boolean;
  classification: Classification;
  path_type?: "absolute" | "relative_to_zip";
  issue?: string;
  size_display?: string;
  size_bytes?: number;
  last_modified?: string;
  extension?: string;
  is_file?: boolean;
  is_dir?: boolean;
  files_in_dir?: number;
  dataframe_preview?: DataframePreview;
};

type CheckResults = {
  mode: string;
  inputs: PathEntry[];
  outputs: PathEntry[];
  other: PathEntry[];
  inputs_accessible: boolean;
  inputs_missing: string[];
  unclassified_path_keys: string[];
  config_used: Record<string, any>;
};

type ConfigDiff = Record<string, { from: any; to: any }>;

type PrepareData = {
  execution_id: string;
  etl_config: Record<string, any>;
  execution_config: Record<string, any>;
  config_file_path?: string;
  path_like_keys: Record<string, string>;
  path_classifications: Record<string, string>;
  output_delivery: OutputDelivery;
  notify_email: string;
  config_diff?: ConfigDiff;
};

type Props = {
  etl: Etl;
  onClose: () => void;
  onDone: () => void;
  onCreateExecution: (etlId: string, label: string) => Promise<any>;
  onLaunch: (executionId: string) => Promise<void>;
};

type Step = "label" | "config" | "classify" | "check" | "progress";

// ─────────────────────────────────────────────────────────────
// Styles (design tokens)
// ─────────────────────────────────────────────────────────────

const T = {
  // colours
  bg: "#ffffff",
  surface: "#f8fafc",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  text: "#0f172a",
  textMid: "#475569",
  textMuted: "#94a3b8",
  accent: "#2563eb",
  accentBg: "#eff6ff",
  accentBorder: "#93c5fd",
  success: "#16a34a",
  successBg: "#f0fdf4",
  successBorder: "#86efac",
  warn: "#b45309",
  warnBg: "#fffbeb",
  warnBorder: "#fde68a",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  dangerBorder: "#fca5a5",
  inputBg: "#f1f5f9",
  // radii
  r: "8px",
  rLg: "12px",
  // font
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: T.r,
  border: `1px solid ${T.border}`,
  background: T.inputBg,
  color: T.text,
  fontSize: 13,
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
};

// ─────────────────────────────────────────────────────────────
// LaunchModal
// ─────────────────────────────────────────────────────────────

function LaunchModal({ etl, onClose, onDone, onCreateExecution, onLaunch }: Props) {
  const [label, setLabel] = useState(`${etl.name} — ${new Date().toLocaleDateString()}`);
  const [step, setStep] = useState<Step>("label");
  const [execution, setExecution] = useState<Execution | null>(null);
  const [prepareData, setPrepareData] = useState<PrepareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saveAsDefault, setSaveAsDefault] = useState<Record<string, boolean>>({});
  const [outputDelivery, setOutputDelivery] = useState<OutputDelivery>("app");
  const [notifyEmail, setNotifyEmail] = useState("");

  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  const [checkResults, setCheckResults] = useState<CheckResults | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<"sample" | "stats">("sample");

  // Auto-refresh while running
  useEffect(() => {
    if (!execution) return;
    if (!["PENDING", "INSTALLING_DEPS", "RUNNING"].includes(execution.status)) return;
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

  // ── Step 2: Save config → go to classify ─────────────────────────
  async function handleConfigConfirm() {
    if (!execution || !prepareData) return;
    try {
      setLoading(true); setErr(null);

      const etlConfig = prepareData.etl_config;
      const cleanOverrides: Record<string, any> = {};
      Object.entries(overrides).forEach(([k, v]) => {
        if (v.trim() !== "" && v !== String(etlConfig[k] ?? "")) cleanOverrides[k] = v;
      });

      // Save selected fields as ETL default (admin only)
      const defaultsToSave: Record<string, any> = {};
      Object.entries(saveAsDefault).forEach(([k, shouldSave]) => {
        if (shouldSave && cleanOverrides[k] !== undefined) defaultsToSave[k] = cleanOverrides[k];
      });
      if (Object.keys(defaultsToSave).length > 0 && (etl as any).is_admin_user) {
        await apiFetch(`/etls/${etl.id}/update_base_config/`, {
          method: "POST",
          body: JSON.stringify({ config: defaultsToSave }),
        });
      }

      await updateExecutionConfig(execution.id, {
        overrides: cleanOverrides,
        output_delivery: outputDelivery,
        notify_email: outputDelivery !== "app" ? notifyEmail : "",
      });

      const freshPrepare: PrepareData = await prepareExecution(execution.id);
      setPrepareData(freshPrepare);

      setClassifications(prev => {
        const next = { ...prev };
        Object.keys(freshPrepare.path_like_keys).forEach(key => {
          if (!(key in next)) next[key] = "skip";
        });
        return next;
      });

      setStep("classify");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  // ── Step 3: Classify → check paths ───────────────────────────────
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
    } catch (e: any) {
      setErr(e.message);
      setStep("check");
    } finally { setLoading(false); }
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

  // ── PROGRESS ──────────────────────────────────────────────────────
  if (step === "progress" && execution) {
    return (
      <ModalShell onClose={onClose} title="Running ETL" subtitle={execution.execution_label || etl.name}>
        <ExecutionProgress execution={execution} />
        {["SUCCESS", "FAILED"].includes(execution.status) && (
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
        onClose={onClose}
        title="Path check"
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
          results={checkResults}
          expandedKey={expandedKey}
          onToggleExpand={setExpandedKey}
          activeTab={activePreviewTab}
          onTabChange={setActivePreviewTab}
        />
        {err && <ErrorBox>{err}</ErrorBox>}
      </ModalShell>
    );
  }

  // ── CLASSIFY ──────────────────────────────────────────────────────
  if (step === "classify" && prepareData) {
    const pathKeys = prepareData.path_like_keys;
    const keys = Object.keys(pathKeys);

    return (
      <ModalShell
        onClose={onClose}
        title="Classify paths"
        subtitle={`${keys.length} path${keys.length !== 1 ? "s" : ""} detected in config`}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <GhostBtn onClick={() => setStep("config")} disabled={checkLoading}>← Back</GhostBtn>
            <div style={{ display: "flex", gap: 8 }}>
              {(etl as any).is_admin_user && (
                <GhostBtn
                  onClick={() => handleClassifyConfirm(true)}
                  disabled={checkLoading}
                  title="Also save these classifications to the ETL for all future users"
                >
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
        {keys.length === 0 ? (
          <InfoBox>No path-like values detected in config. You can launch directly.</InfoBox>
        ) : (
          <>
            <p style={{ fontSize: 12, color: T.textMuted, margin: "0 0 14px" }}>
              Label each config path as <strong>Input</strong> (file the ETL reads),{" "}
              <strong>Output</strong> (file/folder it writes), or <strong>Skip</strong> to ignore.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {keys.map(key => (
                <PathClassifyRow
                  key={key}
                  configKey={key}
                  rawValue={pathKeys[key]}
                  classification={classifications[key] || "skip"}
                  onChange={val => setClassifications(prev => ({ ...prev, [key]: val }))}
                />
              ))}
            </div>
          </>
        )}
        {err && <ErrorBox>{err}</ErrorBox>}
      </ModalShell>
    );
  }

  // ── CONFIG ────────────────────────────────────────────────────────
  if (step === "config" && execution && prepareData) {
    const etlConfig = prepareData.etl_config || {};
    const configKeys = Object.keys(etlConfig).filter(
      k => !["input_requirements", "expected_outputs"].includes(k)
    );
    const changedCount = Object.keys(overrides).filter(
      k => overrides[k] !== String(etlConfig[k] ?? "")
    ).length;

    return (
      <ModalShell
        onClose={onClose}
        title="Configure run"
        subtitle={prepareData.config_file_path ? `Config: ${prepareData.config_file_path}` : `${etl.name}`}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <GhostBtn onClick={() => setStep("label")} disabled={loading}>← Back</GhostBtn>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {changedCount > 0 && (
                <span style={{ fontSize: 12, color: T.accent }}>
                  {changedCount} change{changedCount !== 1 ? "s" : ""}
                </span>
              )}
              <Button onClick={handleConfigConfirm} disabled={loading}>
                {loading ? "Saving…" : "Next: classify paths →"}
              </Button>
            </div>
          </div>
        }
      >
        {configKeys.length === 0 ? (
          <InfoBox>No config file — ETL will run with default settings.</InfoBox>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: T.textMuted, margin: "0 0 6px" }}>
              Override any value for this run only, or check <em>Save as default</em> to update the ETL's base config.
            </p>
            {configKeys.map(key => {
              const baseVal = String(etlConfig[key] ?? "");
              const currentVal = overrides[key] !== undefined ? overrides[key] : baseVal;
              const isChanged = currentVal !== baseVal;
              return (
                <ConfigField
                  key={key}
                  fieldKey={key}
                  currentVal={currentVal}
                  baseVal={baseVal}
                  isChanged={isChanged}
                  saveAsDefault={!!saveAsDefault[key]}
                  isAdmin={!!(etl as any).is_admin_user}
                  onChange={v => setOverrides(prev => ({ ...prev, [key]: v }))}
                  onReset={() => setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; })}
                  onToggleSaveAsDefault={v => setSaveAsDefault(prev => ({ ...prev, [key]: v }))}
                />
              );
            })}
          </div>
        )}

        <DeliveryPicker
          outputDelivery={outputDelivery}
          notifyEmail={notifyEmail}
          onChangeDelivery={setOutputDelivery}
          onChangeEmail={setNotifyEmail}
        />
        {err && <ErrorBox>{err}</ErrorBox>}
      </ModalShell>
    );
  }

  // ── LABEL ─────────────────────────────────────────────────────────
  return (
    <ModalShell
      onClose={onClose}
      title="Launch ETL"
      subtitle={`${etl.name} v${etl.version}`}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
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
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          style={inputStyle}
          placeholder="Give this run a name…"
          autoFocus
        />
      </div>
      <StepPreview />
      {err && <ErrorBox>{err}</ErrorBox>}
    </ModalShell>
  );
}

export default LaunchModal

// ─────────────────────────────────────────────────────────────
// ConfigField — with optional "Save as default" checkbox
// ─────────────────────────────────────────────────────────────

function ConfigField({
  fieldKey, currentVal, baseVal, isChanged, saveAsDefault, isAdmin,
  onChange, onReset, onToggleSaveAsDefault,
}: {
  fieldKey: string;
  currentVal: string;
  baseVal: string;
  isChanged: boolean;
  saveAsDefault: boolean;
  isAdmin: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
  onToggleSaveAsDefault: (v: boolean) => void;
}) {
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: T.r,
      border: `1px solid ${isChanged ? T.accentBorder : T.border}`,
      background: isChanged ? T.accentBg : T.surface,
      transition: "all .15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.textMid, fontWeight: 600 }}>
          {fieldKey}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isChanged && isAdmin && (
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.accent, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={e => onToggleSaveAsDefault(e.target.checked)}
                style={{ margin: 0 }}
              />
              Save as default
            </label>
          )}
          {isChanged && (
            <button onClick={onReset} style={{
              fontSize: 11, color: T.textMuted, background: "none", border: "none",
              cursor: "pointer", padding: "1px 4px",
            }}>
              ↺ reset
            </button>
          )}
        </div>
      </div>
      <input
        value={currentVal}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, background: isChanged ? "#fff" : T.inputBg }}
      />
      {isChanged && (
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
          Default: <code style={{ fontFamily: T.mono }}>{baseVal || <em>empty</em>}</code>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PathClassifyRow
// ─────────────────────────────────────────────────────────────

function PathClassifyRow({ configKey, rawValue, classification, onChange }: {
  configKey: string;
  rawValue: string;
  classification: Classification;
  onChange: (v: Classification) => void;
}) {
  const opts: { value: Classification; label: string; color: string; bg: string }[] = [
    { value: "input",  label: "Input",  color: T.success, bg: T.successBg },
    { value: "output", label: "Output", color: T.accent,  bg: T.accentBg },
    { value: "skip",   label: "Skip",   color: T.textMuted, bg: T.surface },
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
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono, color: T.text }}>{configKey}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rawValue}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {opts.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                border: `1px solid ${classification === opt.value ? opt.color : T.border}`,
                background: classification === opt.value ? opt.bg : "#fff",
                color: classification === opt.value ? opt.color : T.textMuted,
                fontWeight: classification === opt.value ? 600 : 400,
                transition: "all .12s",
              }}
            >
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
  results: CheckResults;
  expandedKey: string | null;
  onToggleExpand: (k: string | null) => void;
  activeTab: "sample" | "stats";
  onTabChange: (t: "sample" | "stats") => void;
}) {
  const { inputs, outputs, other, inputs_accessible, inputs_missing, unclassified_path_keys } = results;

  return (
    <div>
      {inputs.length > 0 && (
        <div style={{
          padding: "10px 14px", borderRadius: T.r, marginBottom: 14,
          background: inputs_accessible ? T.successBg : T.warnBg,
          border: `1px solid ${inputs_accessible ? T.successBorder : T.warnBorder}`,
          fontSize: 13,
          color: inputs_accessible ? T.success : T.warn,
        }}>
          {inputs_accessible
            ? `✓ All ${inputs.length} input${inputs.length !== 1 ? "s" : ""} accessible`
            : `⚠ ${inputs_missing.length} input${inputs_missing.length !== 1 ? "s" : ""} not found: ${inputs_missing.join(", ")}`}
        </div>
      )}

      {unclassified_path_keys.length > 0 && (
        <div style={{
          padding: "8px 12px", borderRadius: T.r, marginBottom: 12,
          background: T.warnBg, border: `1px solid ${T.warnBorder}`,
          fontSize: 12, color: T.warn,
        }}>
          {unclassified_path_keys.length} path key{unclassified_path_keys.length !== 1 ? "s" : ""} not yet classified:{" "}
          <code style={{ fontFamily: T.mono }}>{unclassified_path_keys.join(", ")}</code>
        </div>
      )}

      {inputs.length > 0 && (
        <PathSection title="Inputs" color={T.success} entries={inputs}
          expandedKey={expandedKey} onToggle={onToggleExpand}
          activeTab={activeTab} onTabChange={onTabChange} />
      )}
      {outputs.length > 0 && (
        <PathSection title="Outputs" color={T.accent} entries={outputs}
          expandedKey={expandedKey} onToggle={onToggleExpand}
          activeTab={activeTab} onTabChange={onTabChange} />
      )}
      {other.length > 0 && (
        <PathSection title="Other" color={T.textMuted} entries={other}
          expandedKey={expandedKey} onToggle={onToggleExpand}
          activeTab={activeTab} onTabChange={onTabChange} />
      )}

      {inputs.length === 0 && outputs.length === 0 && other.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
          No paths to check — all keys were skipped.
        </div>
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
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: ".07em", color, marginBottom: 8,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {title}
        <span style={{ fontSize: 10, background: color + "22", color, padding: "1px 6px", borderRadius: 99, fontWeight: 600 }}>
          {entries.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(e => (
          <PathResultCard
            key={e.config_key} entry={e}
            expanded={expandedKey === e.config_key}
            onToggle={() => onToggle(expandedKey === e.config_key ? null : e.config_key)}
            activeTab={activeTab} onTabChange={onTabChange}
          />
        ))}
      </div>
    </div>
  );
}

function PathResultCard({ entry, expanded, onToggle, activeTab, onTabChange }: {
  entry: PathEntry; expanded: boolean; onToggle: () => void;
  activeTab: "sample" | "stats"; onTabChange: (t: "sample" | "stats") => void;
}) {
  const hasPreview = !!(
    entry.dataframe_preview &&
    !entry.dataframe_preview.error &&
    !entry.dataframe_preview.skipped
  );
  const classColor =
    entry.classification === "input" ? T.success
    : entry.classification === "output" ? T.accent
    : T.textMuted;

  return (
    <div style={{
      borderRadius: T.r,
      border: `1px solid ${entry.accessible ? T.border : T.dangerBorder}`,
      background: entry.accessible ? "#fff" : T.dangerBg,
      overflow: "hidden",
      transition: "box-shadow .15s",
    }}>
      <div
        style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: hasPreview ? "pointer" : "default" }}
        onClick={hasPreview ? onToggle : undefined}
      >
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: entry.accessible ? T.success : T.danger,
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono, color: T.text }}>{entry.config_key}</span>
            <Chip color={classColor}>{entry.classification}</Chip>
            {entry.extension && <Chip color={T.textMid}>{entry.extension}</Chip>}
            {entry.path_type && (
              <Chip color={entry.path_type === "absolute" ? "#7c3aed" : "#0369a1"}>
                {entry.path_type === "absolute" ? "local" : "in zip"}
              </Chip>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.path || entry.raw_path || "—"}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {entry.accessible && entry.size_display && (
            <div style={{ fontSize: 12, color: T.textMid }}>{entry.size_display}</div>
          )}
          {entry.accessible && entry.is_dir && entry.files_in_dir != null && (
            <div style={{ fontSize: 11, color: T.textMuted }}>{entry.files_in_dir} files</div>
          )}
          {entry.accessible && entry.last_modified && (
            <div style={{ fontSize: 11, color: T.textMuted }}>{new Date(entry.last_modified).toLocaleDateString()}</div>
          )}
          {!entry.accessible && <div style={{ fontSize: 11, color: T.danger }}>Not found</div>}
          {hasPreview && (
            <div style={{ fontSize: 11, color: T.accent, marginTop: 2 }}>{expanded ? "▲ hide" : "▼ preview"}</div>
          )}
        </div>
      </div>

      {entry.issue && (
        <div style={{ padding: "6px 12px", background: T.dangerBg, borderTop: `1px solid ${T.dangerBorder}`, fontSize: 11, color: T.danger }}>
          {entry.issue}
        </div>
      )}

      {expanded && entry.dataframe_preview && (
        <DataframePreview preview={entry.dataframe_preview} activeTab={activeTab} onTabChange={onTabChange} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DataframePreview — Sample rows + Column stats tabs
// ─────────────────────────────────────────────────────────────

function DataframePreview({ preview, activeTab, onTabChange }: {
  preview: DataframePreview;
  activeTab: "sample" | "stats";
  onTabChange: (t: "sample" | "stats") => void;
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

  const cols = preview.columns || [];
  const rows = preview.sample_rows || [];
  const stats = preview.col_stats || {};
  const hasStats = Object.keys(stats).length > 0;

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>
      {/* Header bar */}
      <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: T.textMuted }}>
          <span><strong style={{ color: T.text }}>{cols.length}</strong> cols</span>
          {preview.row_count != null && <span><strong style={{ color: T.text }}>{preview.row_count.toLocaleString()}</strong> rows</span>}
          {rows.length > 0 && <span style={{ color: T.textMuted }}>{rows.length} sampled</span>}
        </div>
        {hasStats && (
          <div style={{ display: "flex", gap: 4 }}>
            {(["sample", "stats"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                style={{
                  padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                  border: `1px solid ${activeTab === tab ? T.accent : T.border}`,
                  background: activeTab === tab ? T.accentBg : "#fff",
                  color: activeTab === tab ? T.accent : T.textMuted,
                  fontWeight: activeTab === tab ? 600 : 400,
                }}
              >
                {tab === "sample" ? "Sample" : "Stats"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sample rows table */}
      {activeTab === "sample" && (
        <div style={{ overflowX: "auto", maxHeight: 240 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                <th style={TH}>Column</th>
                <th style={{ ...TH, color: T.textMuted, fontWeight: 500 }}>Type</th>
                {rows.map((_, i) => (
                  <th key={i} style={{ ...TH, color: T.textMuted, fontWeight: 400 }}>row {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.map((col, ci) => (
                <tr key={col} style={{ borderBottom: `1px solid #f1f5f9` }}>
                  <td style={{ ...TD, fontFamily: T.mono, color: T.text, whiteSpace: "nowrap" }}>{col}</td>
                  <td style={{ ...TD, color: T.textMuted, fontFamily: T.mono, fontSize: 10 }}>
                    {preview.dtypes?.[col] || "—"}
                  </td>
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
      )}

      {/* Column stats table */}
      {activeTab === "stats" && hasStats && (
        <div style={{ overflowX: "auto", maxHeight: 260 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                {["Column", "Type", "Nulls", "Min", "Max", "Mean", "Unique"].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.map(col => {
                const s = stats[col];
                if (!s) return null;
                return (
                  <tr key={col} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ ...TD, fontFamily: T.mono, color: T.text, whiteSpace: "nowrap" }}>{col}</td>
                    <td style={{ ...TD, fontFamily: T.mono, fontSize: 10, color: T.textMuted }}>{s.dtype}</td>
                    <td style={{ ...TD }}>
                      <span style={{
                        fontSize: 10, padding: "1px 5px", borderRadius: 4,
                        background: s.null_pct > 10 ? T.warnBg : T.surface,
                        color: s.null_pct > 10 ? T.warn : T.textMuted,
                      }}>
                        {s.null_count} ({s.null_pct}%)
                      </span>
                    </td>
                    <td style={{ ...TD, fontFamily: T.mono, color: T.textMid }}>{fmtNum(s.min)}</td>
                    <td style={{ ...TD, fontFamily: T.mono, color: T.textMid }}>{fmtNum(s.max)}</td>
                    <td style={{ ...TD, fontFamily: T.mono, color: T.textMid }}>{fmtNum(s.mean)}</td>
                    <td style={{ ...TD, color: T.textMuted }}>{s.unique_count ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return v.toExponential(2);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3);
}

const TH: React.CSSProperties = {
  padding: "5px 10px", textAlign: "left", fontWeight: 600,
  color: T.textMid, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
};
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
          <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4 }}>
            Email address
          </label>
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
  const isFailed = execution.status === "FAILED";

  const statusColor = isSuccess ? T.success : isFailed ? T.danger : T.accent;
  const statusBg = isSuccess ? T.successBg : isFailed ? T.dangerBg : T.accentBg;
  const statusBorder = isSuccess ? T.successBorder : isFailed ? T.dangerBorder : T.accentBorder;

  const logLines = (execution.stdout_log || "Starting…").split("\n").filter(l => l.trim());
  const recentLines = logLines.slice(-8).join("\n");

  // Simple timeline
  const steps = [
    { label: "Copy code",    done: !["PENDING"].includes(execution.status) },
    { label: "Write config", done: ["INSTALLING_DEPS", "RUNNING", "SUCCESS", "FAILED"].includes(execution.status) },
    { label: "Venv",         done: ["RUNNING", "SUCCESS", "FAILED"].includes(execution.status) },
    { label: "Run",          done: ["SUCCESS", "FAILED"].includes(execution.status) },
  ];

  return (
    <div>
      <div style={{
        padding: "14px 16px", borderRadius: T.r, marginBottom: 14,
        background: statusBg, border: `1px solid ${statusBorder}`,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: statusColor, marginBottom: 4 }}>
          {isSuccess ? "Completed successfully ✓" : isFailed ? "Execution failed" : `${execution.status.replace("_", " ")}…`}
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

      {/* Step timeline */}
      <div style={{ display: "flex", gap: 0, marginBottom: 14, background: T.surface, borderRadius: T.r, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        {steps.map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: "8px 4px", textAlign: "center",
            borderRight: i < steps.length - 1 ? `1px solid ${T.border}` : "none",
            background: s.done ? T.successBg : "transparent",
            transition: "background .3s",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.done ? T.success : T.textMuted }}>
              {s.done ? "✓ " : ""}{s.label}
            </div>
          </div>
        ))}
      </div>

      {isRunning && (
        <pre style={{
          background: "#0f172a", color: "#94a3b8", borderRadius: T.r,
          padding: 12, fontSize: 11, fontFamily: T.mono, whiteSpace: "pre-wrap",
          maxHeight: 200, overflowY: "auto", margin: 0,
        }}>
          {recentLines}
        </pre>
      )}

      {isFailed && execution.error_message && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: T.r, background: T.dangerBg, border: `1px solid ${T.dangerBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.danger, marginBottom: 4 }}>Error</div>
          <pre style={{ fontSize: 11, color: T.danger, fontFamily: T.mono, whiteSpace: "pre-wrap", margin: 0 }}>
            {execution.error_message}
          </pre>
        </div>
      )}

      {isSuccess && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: T.r, textAlign: "center", background: T.successBg, border: `1px solid ${T.successBorder}` }}>
          <div style={{ fontSize: 14, color: T.success, fontWeight: 700 }}>
            ETL completed
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shell & small utils
// ─────────────────────────────────────────────────────────────

function ModalShell({ children, onClose, title, subtitle, footer }: {
  children: React.ReactNode; onClose: () => void;
  title: string; subtitle?: string; footer?: React.ReactNode;
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
        {footer && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: color + "22", color }}>
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
  const steps = ["Review & change config values", "Label each path: Input, Output, or Skip", "Check all paths are accessible", "Launch"];
  return (
    <div style={{ padding: "12px 16px", borderRadius: T.r, background: T.accentBg, border: `1px solid ${T.accentBorder}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>What happens next</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3b82f6" }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", background: "#2563eb",
              color: "#fff", fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>{i + 1}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}