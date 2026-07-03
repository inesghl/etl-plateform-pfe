"""
execution/services/step_engine.py
──────────────────────────────────
Handles ETLs that declare a `steps` array in their config.json.

Each step:
  - declares named inputs (references to previous step outputs or ETL inputs)
  - declares named outputs (relative paths inside its snapshot dir)
  - runs its script with a step_inputs.json file it can read

Partial re-runs: skip steps before rerun_from_step, reuse their snapshots.
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Optional

from django.utils import timezone

from ..models import Execution, StepExecution

OUTPUT_EXTENSIONS = {
    ".xlsx", ".xls", ".csv", ".pdf", ".zip",
    ".json", ".txt", ".parquet",
}


# ─────────────────────────────────────────────────────────────
# Config helpers
# ─────────────────────────────────────────────────────────────

def has_steps_config(config: dict) -> bool:
    """Return True if this ETL uses the step-chain format."""
    return bool(config.get("steps"))


def get_steps(config: dict) -> list:
    """Return steps sorted by order."""
    return sorted(config.get("steps", []), key=lambda s: s["order"])


# ─────────────────────────────────────────────────────────────
# Path helpers
# ─────────────────────────────────────────────────────────────

def _step_dir(work_dir: Path, step_name: str) -> Path:
    """Working directory for a step (holds step_inputs.json + runner script)."""
    return work_dir / "steps" / step_name


def _step_snapshot_dir(work_dir: Path, step_name: str) -> Path:
    """Where this step's outputs are saved (the snapshot)."""
    return work_dir / "steps" / step_name / "output"


# ─────────────────────────────────────────────────────────────
# Input reference resolver
# ─────────────────────────────────────────────────────────────

def _resolve_input(ref: str, execution: Execution, work_dir: Path, config: dict,
                   override: Optional[str] = None) -> str:
    """
    Resolve an input reference to an absolute path.

    Supported formats:
      steps.<step_name>.<output_name>  →  previous step's snapshot file
      etl_inputs.<key>                 →  original ETL input from execution_config
      /absolute/path  or  C:/path      →  used as-is
      ./relative/path                  →  resolved against work_dir
    """
    # User-supplied override always wins
    if override is not None and override.strip():
        return override.strip()

    if ref.startswith("steps."):
        # e.g. steps.extract.raw_data
        remainder = ref[len("steps."):]
        dot = remainder.find(".")
        if dot == -1:
            raise ValueError(f"Invalid step reference '{ref}': expected steps.<step>.<output>")
        step_name = remainder[:dot]
        output_name = remainder[dot + 1:]

        steps_by_name = {s["name"]: s for s in config.get("steps", [])}
        if step_name not in steps_by_name:
            raise ValueError(f"Reference '{ref}' points to unknown step '{step_name}'")

        step_outputs = steps_by_name[step_name].get("outputs", {})
        if output_name not in step_outputs:
            raise ValueError(
                f"Reference '{ref}': step '{step_name}' has no output named '{output_name}'. "
                f"Available: {list(step_outputs)}"
            )

        relative_output = step_outputs[output_name]
        # Strip leading "output/" prefix if present — snapshot dir is already the output dir
        if relative_output.startswith("output/") or relative_output.startswith("output\\"):
            relative_output = relative_output[len("output/"):]
        return str(_step_snapshot_dir(work_dir, step_name) / relative_output)

    elif ref.startswith("etl_inputs."):
        key = ref[len("etl_inputs."):]
        val = (execution.execution_config or {}).get(key, "")
        return str(val) if val else ""

    elif Path(ref).is_absolute():
        return ref

    else:
        # Relative path → resolve against work_dir
        return str((work_dir / ref).resolve())


# ─────────────────────────────────────────────────────────────
# step_inputs.json writer
# ─────────────────────────────────────────────────────────────

def _write_step_inputs(step_dir: Path, resolved_inputs: dict, snapshot_dir: Path) -> Path:
    """
    Write step_inputs.json into the step's working dir.
    The script reads this file to discover its input paths and output directory.

    Format:
      {
        "inputs": { "data": "/abs/path/file.csv", ... },
        "output_dir": "/abs/path/steps/<name>/output/"
      }
    """
    step_dir.mkdir(parents=True, exist_ok=True)
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "inputs": resolved_inputs,
        "output_dir": str(snapshot_dir),
    }
    inputs_file = step_dir / "step_inputs.json"
    inputs_file.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return inputs_file


# ─────────────────────────────────────────────────────────────
# Single step runner
# ─────────────────────────────────────────────────────────────

def _run_step_script(
    script_name: str,
    etl_code_dir: Path,
    step_dir: Path,
    step_inputs_file: Path,
    venv_dir: Path,
    activate_script: Path,
) -> tuple:
    """Run one step script. Returns (return_code, stdout, stderr)."""
    # Find the script (search recursively inside etl_code)
    script_path = etl_code_dir / script_name
    if not script_path.exists():
        matches = list(etl_code_dir.rglob(script_name))
        if not matches:
            raise FileNotFoundError(
                f"Script '{script_name}' not found in ETL code at {etl_code_dir}"
            )
        script_path = sorted(matches, key=lambda p: len(p.parts))[0]

    is_nt = os.name == "nt"

    if is_nt:
        runner_content = (
            f'@echo off\n'
            f'call "{activate_script}"\n'
            f'if errorlevel 1 exit /b 1\n'
            f'set ETL_STEP_INPUTS={step_inputs_file}\n'
            f'set PYTHONIOENCODING=utf-8\n'
            f'python "{script_path}"\n'
            f'set STEP_EXIT=%ERRORLEVEL%\n'
            f'deactivate\n'
            f'exit /b %STEP_EXIT%\n'
        )
        runner_path = step_dir / "run_step.bat"
        runner_path.write_text(runner_content, encoding="utf-8")
        cmd = ["cmd", "/c", str(runner_path)]
    else:
        runner_content = (
            f'#!/bin/bash\n'
            f'source "{activate_script}"\n'
            f'export ETL_STEP_INPUTS="{step_inputs_file}"\n'
            f'python "{script_path}"\n'
            f'STEP_EXIT=$?\n'
            f'deactivate\n'
            f'exit $STEP_EXIT\n'
        )
        runner_path = step_dir / "run_step.sh"
        runner_path.write_text(runner_content, encoding="utf-8")
        runner_path.chmod(0o755)
        cmd = ["/bin/bash", str(runner_path)]

    proc = subprocess.Popen(
        cmd,
        cwd=str(step_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        out, err = proc.communicate(timeout=3600)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
        err += "\n[STEP ENGINE] Step timed out after 3600s."

    try:
        runner_path.unlink()
    except Exception:
        pass

    return proc.returncode, out, err


# ─────────────────────────────────────────────────────────────
# Output collection
# ─────────────────────────────────────────────────────────────

def _collect_step_outputs(execution: Execution, work_dir: Path, steps: list) -> int:
    """Register declared output files from all step snapshots as OutputFile records."""
    from ...output_file.models import OutputFile

    registered: set = set()
    count = 0

    for step_def in steps:
        snapshot_dir = _step_snapshot_dir(work_dir, step_def["name"])
        if not snapshot_dir.exists():
            continue

        for output_name, relative_path in step_def.get("outputs", {}).items():
            if relative_path.startswith("output/") or relative_path.startswith("output\\"):
                relative_path = relative_path[len("output/"):]
            file_path = snapshot_dir / relative_path
            if not file_path.exists() or not file_path.is_file():
                continue
            if file_path.suffix.lower() not in OUTPUT_EXTENSIONS:
                continue

            dedup_key = (file_path.name, file_path.stat().st_size)
            if dedup_key in registered:
                continue
            registered.add(dedup_key)

            if OutputFile.objects.filter(execution=execution, filename=file_path.name).exists():
                continue

            suffix = file_path.suffix.lower()
            file_type = (
                "excel"   if suffix in {".xlsx", ".xls"} else
                "csv"     if suffix == ".csv"             else
                "pdf"     if suffix == ".pdf"             else
                "zip"     if suffix == ".zip"             else
                "parquet" if suffix == ".parquet"         else
                "other"
            )
            OutputFile.objects.create(
                execution=execution,
                filename=file_path.name,
                file_path=str(file_path),
                file_size=file_path.stat().st_size,
                file_type=file_type,
            )
            print(f"[STEP_OUTPUT] Registered: {file_path.name} ({file_type})")
            count += 1

    return count


# ─────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────

def run_steps(
    execution: Execution,
    work_dir: Path,
    etl_code_dir: Path,
    venv_dir: Path,
    activate_script: Path,
    config: dict,
    rerun_from_step: Optional[int] = None,
) -> tuple:
    """
    Run all steps in order.

    If rerun_from_step is set, steps with order < rerun_from_step are marked
    SKIPPED and their existing snapshots are reused as inputs for later steps.

    Returns (success: bool, combined_stdout: str, combined_stderr: str, output_count: int)
    """
    steps = get_steps(config)
    all_stdout = ""
    all_stderr = ""

    # Build or update StepExecution DB records
    existing = {se.step_order: se for se in StepExecution.objects.filter(execution=execution)}

    step_records: list[tuple[dict, StepExecution]] = []
    for step_def in steps:
        order = step_def["order"]
        if order in existing:
            se = existing[order]
            # Reset this step if we are re-running it or anything after it
            if rerun_from_step is not None and order >= rerun_from_step:
                se.status = "PENDING"
                se.stdout_log = ""
                se.stderr_log = ""
                se.return_code = None
                se.started_at = None
                se.completed_at = None
                se.rerun_count += 1
                se.save()
        else:
            se = StepExecution.objects.create(
                execution=execution,
                step_order=order,
                step_name=step_def["name"],
                script=step_def["script"],
            )
        step_records.append((step_def, se))

    # Run (or skip) each step
    for step_def, se in step_records:
        order = step_def["order"]
        name = step_def["name"]

        # ── SKIP ──────────────────────────────────────────────────────
        if rerun_from_step is not None and order < rerun_from_step:
            if se.status != "SKIPPED":
                se.status = "SKIPPED"
                se.save(update_fields=["status"])
            all_stdout += f"\n[STEP {order}: {name}] SKIPPED — reusing snapshot\n"
            continue

        # ── RESOLVE INPUTS ────────────────────────────────────────────
        resolved_inputs: dict = {}
        step_overrides: dict = (execution.step_input_overrides or {}).get(name, {})
        try:
            for input_name, ref in step_def.get("inputs", {}).items():
                resolved_inputs[input_name] = _resolve_input(
                    ref, execution, work_dir, config,
                    override=step_overrides.get(input_name),
                )
        except Exception as exc:
            se.status = "FAILED"
            se.stderr_log = f"Input resolution error: {exc}"
            se.completed_at = timezone.now()
            se.save()
            all_stderr += f"\n[STEP {order}: {name}] Input error: {exc}\n"
            return False, all_stdout, all_stderr, 0

        snapshot_dir = _step_snapshot_dir(work_dir, name)
        step_dir = _step_dir(work_dir, name)

        se.raw_input_refs = step_def.get("inputs", {})
        se.resolved_inputs = resolved_inputs
        se.output_snapshot_path = str(snapshot_dir)
        se.status = "RUNNING"
        se.started_at = timezone.now()
        se.save()

        # ── WRITE step_inputs.json ────────────────────────────────────
        inputs_file = _write_step_inputs(step_dir, resolved_inputs, snapshot_dir)

        divider = "─" * 50
        all_stdout += f"\n{divider}\n[STEP {order}/{len(steps)}: {name}]\n{divider}\n"

        # ── RUN ───────────────────────────────────────────────────────
        try:
            rc, out, err = _run_step_script(
                step_def["script"], etl_code_dir, step_dir, inputs_file,
                venv_dir, activate_script,
            )
        except Exception as exc:
            se.status = "FAILED"
            se.stderr_log = str(exc)
            se.completed_at = timezone.now()
            se.save()
            all_stderr += f"\n[STEP {order}: {name}] Launch error: {exc}\n"
            return False, all_stdout, all_stderr, 0

        se.return_code = rc
        se.stdout_log = out
        se.stderr_log = err
        se.completed_at = timezone.now()
        all_stdout += out
        all_stderr += err

        if rc != 0:
            se.status = "FAILED"
            se.save()
            all_stderr += f"\n[STEP {order}: {name}] FAILED (exit {rc})\n"
            return False, all_stdout, all_stderr, 0

        se.status = "SUCCESS"
        se.save()
        all_stdout += f"\n[STEP {order}: {name}] SUCCESS\n"

    # ── COLLECT ALL OUTPUTS ───────────────────────────────────────────
    output_count = _collect_step_outputs(execution, work_dir, steps)
    return True, all_stdout, all_stderr, output_count
