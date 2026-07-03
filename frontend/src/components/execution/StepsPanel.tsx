import React, { useEffect, useState } from "react";
import { StepExecution, StepStatus } from "../../types/execution";
import { fetchExecutionSteps, rerunFromStep } from "../../api/execution";

type Props = {
  executionId: string;
  executionStatus: string;
  onRerun?: () => void;
};

const STATUS_STYLE: Record<StepStatus, { bg: string; text: string; label: string }> = {
  PENDING:  { bg: "#F1EFE8", text: "#5F5E5A", label: "Pending"  },
  RUNNING:  { bg: "#FAEEDA", text: "#854F0B", label: "Running"  },
  SUCCESS:  { bg: "#EAF3DE", text: "#3B6D11", label: "Success"  },
  FAILED:   { bg: "#FCEBEB", text: "#A32D2D", label: "Failed"   },
  SKIPPED:  { bg: "#E6F1FB", text: "#185FA5", label: "Skipped"  },
};

const MONO = "'JetBrains Mono','Fira Code',monospace";

function StatusBadge({ status }: { status: StepStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
  return (
    <span style={{
      background: s.bg, color: s.text,
      fontSize: 11, padding: "2px 8px",
      borderRadius: 99, fontWeight: 500, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function fmt(secs?: number) {
  if (!secs) return "";
  if (secs < 60) return `${Math.round(secs)}s`;
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
}

// ─── Re-run dialog ────────────────────────────────────────────────────────────

type RerunDialogProps = {
  fromStep: StepExecution;
  allSteps: StepExecution[];
  onConfirm: (overrides: Record<string, Record<string, string>>) => void;
  onCancel: () => void;
};

function RerunDialog({ fromStep, allSteps, onConfirm, onCancel }: RerunDialogProps) {

  // Steps that will actually run (from fromStep.step_order onwards)
  const stepsToRun = allSteps.filter(s => s.step_order >= fromStep.step_order);

  // Build available snapshot sources from steps that will be SKIPPED (before fromStep)
  // We derive output names from the resolved_inputs of later steps that referenced them
  const snapshotSources: { label: string; ref: string }[] = [];
  const seenRefs = new Set<string>();
  for (const s of allSteps) {
    // Collect refs that point to skipped steps
    for (const ref of Object.values(s.raw_input_refs ?? {})) {
      if (ref.startsWith("steps.") && !seenRefs.has(ref)) {
        const parts = ref.split(".");  // ["steps", stepName, outputName]
        if (parts.length === 3) {
          const refStepName = parts[1];
          const refStep = allSteps.find(x => x.step_name === refStepName);
          if (refStep && refStep.step_order < fromStep.step_order) {
            seenRefs.add(ref);
            snapshotSources.push({
              label: `${ref}  (step ${refStep.step_order} snapshot)`,
              ref,
            });
          }
        }
      }
    }
  }

  // overrides state: { step_name: { input_name: custom_value_or_ref } }
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const s of stepsToRun) {
      init[s.step_name] = {};
    }
    return init;
  });

  function setInputOverride(stepName: string, inputName: string, value: string) {
    setOverrides(prev => ({
      ...prev,
      [stepName]: { ...prev[stepName], [inputName]: value },
    }));
  }

  function handleConfirm() {
    // Only pass overrides that are non-empty strings
    const clean: Record<string, Record<string, string>> = {};
    for (const [stepName, inputs] of Object.entries(overrides)) {
      const filled = Object.fromEntries(
        Object.entries(inputs).filter(([, v]) => v.trim() !== "")
      );
      if (Object.keys(filled).length > 0) clean[stepName] = filled;
    }
    onConfirm(clean);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.35)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 12,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        width: "min(700px, 96vw)", maxHeight: "88vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 22px 14px",
          borderBottom: "1px solid #e2e8f0",
        }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>
            Re-run from step {fromStep.step_order}: <em>{fromStep.step_name}</em>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
            Steps before this will be skipped — their snapshots are reused.
            Override any input below, or leave blank to use the auto-resolved value.
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "16px 22px", flex: 1 }}>
          {stepsToRun.map((step, si) => {
            const inputDefs: Record<string, string> = step.raw_input_refs ?? {};
            const inputNames = Object.keys(inputDefs);

            return (
              <div key={step.id} style={{ marginBottom: si < stepsToRun.length - 1 ? 20 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    background: "#eff6ff", color: "#2563eb",
                    borderRadius: 99, padding: "2px 10px",
                    fontSize: 12, fontWeight: 600,
                  }}>
                    Step {step.step_order}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                    {step.step_name}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: MONO }}>
                    {step.script}
                  </span>
                </div>

                {inputNames.length === 0 && (
                  <p style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 4 }}>No inputs declared.</p>
                )}

                {inputNames.map(inputName => {
                  const autoRef = inputDefs[inputName];
                  const autoResolved = step.resolved_inputs?.[inputName] ?? "";
                  const currentOverride = overrides[step.step_name]?.[inputName] ?? "";

                  return (
                    <div key={inputName} style={{
                      marginBottom: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${currentOverride ? "#2563eb44" : "#e2e8f0"}`,
                      background: currentOverride ? "#eff6ff" : "#f8fafc",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", fontFamily: MONO }}>
                          {inputName}
                        </span>
                        {currentOverride && (
                          <button
                            onClick={() => setInputOverride(step.step_name, inputName, "")}
                            style={{
                              fontSize: 10, color: "#94a3b8",
                              background: "none", border: "none", cursor: "pointer",
                            }}
                          >
                            reset to auto
                          </button>
                        )}
                      </div>

                      {/* Auto-resolved hint */}
                      {!currentOverride && autoResolved && (
                        <div style={{
                          fontSize: 11, color: "#64748b", fontFamily: MONO,
                          marginBottom: 6, wordBreak: "break-all",
                        }}>
                          Auto: {autoResolved}
                        </div>
                      )}
                      {!currentOverride && !autoResolved && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                          Auto: <em>{autoRef}</em>
                        </div>
                      )}

                      {/* Dropdown of available snapshot sources */}
                      {snapshotSources.length > 0 && (
                        <select
                          value={currentOverride.startsWith("steps.") ? currentOverride : ""}
                          onChange={e => {
                            if (e.target.value) setInputOverride(step.step_name, inputName, e.target.value);
                            else setInputOverride(step.step_name, inputName, "");
                          }}
                          style={{
                            width: "100%", padding: "6px 8px",
                            borderRadius: 6, border: "1px solid #e2e8f0",
                            background: "#fff", fontSize: 12, color: "#334155",
                            marginBottom: 6,
                          }}
                        >
                          <option value="">— use auto-resolved value —</option>
                          <optgroup label="Use snapshot from previous step">
                            {snapshotSources.map(src => (
                              <option key={src.ref} value={src.ref}>{src.label}</option>
                            ))}
                          </optgroup>
                        </select>
                      )}

                      {/* Custom path input */}
                      <input
                        type="text"
                        placeholder="Or type a custom file path..."
                        value={currentOverride.startsWith("steps.") ? "" : currentOverride}
                        onChange={e => setInputOverride(step.step_name, inputName, e.target.value)}
                        style={{
                          width: "100%", padding: "6px 8px",
                          borderRadius: 6, border: "1px solid #e2e8f0",
                          background: "#fff", fontSize: 12, color: "#334155",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px",
          borderTop: "1px solid #e2e8f0",
          display: "flex", justifyContent: "flex-end", gap: 10,
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px", borderRadius: 8,
              border: "1px solid #e2e8f0", background: "#fff",
              fontSize: 13, color: "#475569", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: "8px 20px", borderRadius: 8,
              border: "none", background: "#2563eb",
              fontSize: 13, color: "#fff",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Run from step {fromStep.step_order} →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function StepsPanel({ executionId, executionStatus, onRerun }: Props) {
  const [steps, setSteps] = useState<StepExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState<number | null>(null);
  const [dialogStep, setDialogStep] = useState<StepExecution | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRunning = ["RUNNING", "PENDING", "INSTALLING_DEPS"].includes(executionStatus);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchExecutionSteps(executionId);
        if (!cancelled) setSteps(data);
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    if (isRunning) {
      const iv = setInterval(load, 2500);
      return () => { cancelled = true; clearInterval(iv); };
    }
    return () => { cancelled = true; };
  }, [executionId, executionStatus]);

  async function handleRerunConfirm(
    stepOrder: number,
    overrides: Record<string, Record<string, string>>,
  ) {
    setDialogStep(null);
    setRerunning(stepOrder);
    setError(null);
    try {
      await rerunFromStep(executionId, stepOrder, overrides);
      onRerun?.();
      setTimeout(async () => {
        const data = await fetchExecutionSteps(executionId);
        setSteps(data);
        setRerunning(null);
      }, 1000);
    } catch (e: any) {
      setError(e.message ?? "Failed to re-run step");
      setRerunning(null);
    }
  }

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading steps...</p>;

  if (steps.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        No steps recorded yet.
      </p>
    );
  }

  return (
    <>
      {dialogStep && (
        <RerunDialog
          fromStep={dialogStep}
          allSteps={steps}
          onConfirm={(overrides) => handleRerunConfirm(dialogStep.step_order, overrides)}
          onCancel={() => setDialogStep(null)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {error && (
          <div style={{
            background: "var(--bg-danger)", color: "var(--text-danger)",
            borderRadius: 6, padding: "8px 12px", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Pipeline bar */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {steps.map((step, i) => (
            <React.Fragment key={step.id}>
              <div style={{
                background: STATUS_STYLE[step.status]?.bg ?? "#F1EFE8",
                color: STATUS_STYLE[step.status]?.text ?? "#5F5E5A",
                borderRadius: 6, padding: "4px 10px",
                fontSize: 12, fontWeight: 500,
              }}>
                {step.step_order}. {step.step_name}
              </div>
              {i < steps.length - 1 && (
                <span style={{ color: "var(--text-muted)", fontSize: 14 }}>&rarr;</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step rows */}
        {steps.map((step) => (
          <div key={step.id} style={{
            border: "0.5px solid var(--border)",
            borderRadius: 8, overflow: "hidden",
            background: "var(--surface-2)",
          }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", cursor: "pointer",
              }}
              onClick={() => setExpanded(expanded === step.id ? null : step.id)}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", minWidth: 20 }}>
                {step.step_order}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1 }}>
                {step.step_name}
                <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 8 }}>
                  {step.script}
                </span>
              </span>
              {fmt(step.duration_seconds ?? undefined) && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {fmt(step.duration_seconds ?? undefined)}
                </span>
              )}
              <StatusBadge status={step.status} />

              {!isRunning && step.status !== "PENDING" && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDialogStep(step); }}
                  disabled={rerunning !== null}
                  style={{
                    fontSize: 11, padding: "3px 10px",
                    border: "0.5px solid var(--border-strong)",
                    borderRadius: 6, background: "transparent",
                    color: "var(--text-secondary)", cursor: "pointer",
                    opacity: rerunning !== null ? 0.5 : 1,
                  }}
                >
                  {rerunning === step.step_order ? "Starting..." : "Re-run from here"}
                </button>
              )}

              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {expanded === step.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === step.id && (
              <div style={{
                borderTop: "0.5px solid var(--border)",
                padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {Object.keys(step.resolved_inputs).length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>
                      RESOLVED INPUTS
                    </p>
                    {Object.entries(step.resolved_inputs).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: "var(--text-secondary)", minWidth: 120, fontFamily: MONO }}>{k}</span>
                        <span style={{ color: "var(--text-muted)", fontFamily: MONO, wordBreak: "break-all", fontSize: 11 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {step.rerun_count > 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Re-run {step.rerun_count} time{step.rerun_count > 1 ? "s" : ""}
                  </p>
                )}

                {step.stdout_log && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>STDOUT</p>
                    <pre style={{
                      background: "var(--surface-1)", borderRadius: 6,
                      padding: "8px 10px", fontSize: 11,
                      color: "var(--text-secondary)", overflow: "auto",
                      maxHeight: 160, margin: 0,
                    }}>
                      {step.stdout_log}
                    </pre>
                  </div>
                )}
                {step.stderr_log && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-danger)", marginBottom: 4 }}>STDERR</p>
                    <pre style={{
                      background: "var(--bg-danger)", borderRadius: 6,
                      padding: "8px 10px", fontSize: 11,
                      color: "var(--text-danger)", overflow: "auto",
                      maxHeight: 160, margin: 0,
                    }}>
                      {step.stderr_log}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
