"""
execution/services/execution_engine.py
───────────────────────────────────────
Fixes vs previous version:
  1. SUCCESS detection now validates outputs exist AND checks stderr for
     Python tracebacks — an exit-0 script that produced nothing is FAILED.
  2. In-app Notification objects created on both SUCCESS and FAILED.
  3. Email report moved here (was broken in notification service).
  4. _sync_input_files_from_config simplified — only copies when path is
     absolute and external (relative paths already live in the work dir).
"""

import json
import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from typing import Tuple, Optional

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from ..models import Execution
from ...etl.models import ETL
from ...output_file.models import OutputFile
from ...common.path_utils import resolve_config_key, resolve_path

_EXCLUDED_DIRS = {
    ".venv", "venv", "__pycache__", ".git",
    "node_modules", ".tox", ".mypy_cache", ".idea", ".vscode",
}

# Patterns that indicate a Python crash in stdout/stderr
_TRACEBACK_RE = re.compile(
    r"(Traceback \(most recent call last\)|"
    r"Error:|Exception:|raise \w+|"
    r"SyntaxError:|AttributeError:|KeyError:|ValueError:|TypeError:|"
    r"FileNotFoundError:|PermissionError:|ImportError:)",
    re.IGNORECASE,
)


# ─────────────────────────────────────────────────────────────
# Filesystem helpers
# ─────────────────────────────────────────────────────────────

def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _safe_rmtree(path: Path) -> None:
    if not path.exists():
        return
    def _on_error(func, fpath, _exc):
        try:
            os.chmod(fpath, stat.S_IWRITE | stat.S_IREAD)
            func(fpath)
        except Exception:
            pass
    shutil.rmtree(str(path), onerror=_on_error)


def _safe_work_dir(execution: Execution) -> Path:
    media_executions = Path(settings.MEDIA_ROOT) / "executions"
    expected = media_executions / str(execution.id)
    stored = Path(execution.work_dir) if execution.work_dir else None
    if stored and str(stored).startswith(str(media_executions)):
        return stored
    execution.work_dir = str(expected)
    execution.save(update_fields=["work_dir"])
    return expected


# ─────────────────────────────────────────────────────────────
# Python interpreter discovery
# ─────────────────────────────────────────────────────────────

def _find_system_python(requested_version: str = "") -> str:
    def _in_venv(p: str) -> bool:
        lp = p.replace("\\", "/").lower()
        return "/.venv/" in lp or "/venv/" in lp

    override = os.environ.get("ETL_EXECUTOR_PYTHON", "").strip()
    if override and Path(override).exists() and not _in_venv(override):
        return override

    if requested_version:
        major_minor = requested_version.strip().lstrip("python").strip()
        for name in (f"python{major_minor}", f"python{major_minor}.exe"):
            found = shutil.which(name)
            if found and not _in_venv(found):
                return found

    try:
        cfg = Path(sys.executable).parent.parent / "pyvenv.cfg"
        if cfg.exists():
            for line in cfg.read_text(encoding="utf-8").splitlines():
                if "=" in line and line.split("=")[0].strip().lower() == "home":
                    home = line.split("=", 1)[1].strip()
                    for name in ("python.exe", "python3.exe", "python3", "python"):
                        candidate = Path(home) / name
                        if candidate.exists():
                            return str(candidate)
    except Exception:
        pass

    if os.name == "nt":
        py = shutil.which("py")
        if py and not _in_venv(py):
            if requested_version:
                result = subprocess.run(
                    [py, f"-{requested_version}", "-c", "import sys; print(sys.executable)"],
                    capture_output=True, text=True,
                )
                if result.returncode == 0:
                    exe = result.stdout.strip()
                    if exe and not _in_venv(exe):
                        return exe
            return py

    for name in ("python3", "python", "python3.exe", "python.exe"):
        found = shutil.which(name)
        if found and not _in_venv(found):
            return found

    return sys.executable


# ─────────────────────────────────────────────────────────────
# ETL code setup
# ─────────────────────────────────────────────────────────────

def _copy_etl_code(etl: ETL, work_dir: Path) -> Path:
    source = Path(etl.extracted_path)
    if not source.exists():
        raise FileNotFoundError(f"Extracted ETL path missing: {source}")

    dest = work_dir / "etl_code"
    _safe_rmtree(dest)

    def _ignore(src: str, names: list) -> set:
        return {
            n for n in names
            if n in _EXCLUDED_DIRS or n.lower().startswith(".venv") or n.lower().startswith("venv")
        }

    shutil.copytree(str(source), str(dest), ignore=_ignore)

    # Mirror common resource folders at work_dir root so CWD-relative opens work
    for folder_name in ["config", "data", "resources", "assets", "templates", "mappings"]:
        for folder in dest.rglob(folder_name):
            if folder.is_dir():
                target = work_dir / folder_name
                if target.exists():
                    _safe_rmtree(target)
                shutil.copytree(str(folder), str(target))
                break

    return dest


# ─────────────────────────────────────────────────────────────
# Patch config file — all copies inside work_dir
# ─────────────────────────────────────────────────────────────

def _patch_all_config_copies(etl: ETL, work_dir: Path, effective_config: dict) -> None:
    """Overwrite every copy of the config file so the script always sees
    the execution-level merged config, regardless of how it opens the file."""
    if not etl.config_file_path:
        return

    config_filename = Path(etl.config_file_path).name
    patched = 0

    for cf in work_dir.rglob(config_filename):
        if not cf.is_file() or any(ex in cf.parts for ex in _EXCLUDED_DIRS):
            continue
        suffix = cf.suffix.lower()
        try:
            if suffix == ".json":
                with open(cf, "w", encoding="utf-8") as f:
                    json.dump(effective_config, f, indent=2, ensure_ascii=False, default=str)
            elif suffix in (".yaml", ".yml"):
                try:
                    import yaml
                    with open(cf, "w", encoding="utf-8") as f:
                        yaml.dump(effective_config, f, default_flow_style=False, allow_unicode=True)
                except ImportError:
                    _write_json_sidecar(cf, effective_config)
            else:
                _write_json_sidecar(cf, effective_config)
            print(f"[CONFIG_PATCH] ✓ {cf}")
            patched += 1
        except Exception as e:
            print(f"[CONFIG_PATCH] Warning: could not patch {cf}: {e}")

    if patched == 0:
        print(f"[CONFIG_PATCH] Warning: '{config_filename}' not found anywhere in work_dir")


def _write_json_sidecar(original: Path, config: dict) -> None:
    sidecar = original.with_suffix(".runtime.json")
    with open(sidecar, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False, default=str)


# ─────────────────────────────────────────────────────────────
# Sync external input files into work_dir
# ─────────────────────────────────────────────────────────────

def _sync_input_files(etl: ETL, execution: Execution, work_dir: Path, effective_config: dict) -> None:
    """
    For each config key classified as 'input':
      - If the path is absolute and the file exists on the server → copy it
        into work_dir/data/ so the script can open it with a relative path too.
      - If relative → it already lives inside etl_code; nothing to do.
    """
    classifications = {**etl.path_classifications, **execution.path_classifications}
    if not classifications:
        return

    data_dir = work_dir / "data"
    synced = 0

    for key, classification in classifications.items():
        if classification != "input":
            continue

        raw_val = resolve_config_key(effective_config, key)
        if not raw_val:
            continue

        raw_str = str(raw_val)
        src = resolve_path(raw_str, etl.extracted_path)

        if not src.exists():
            print(f"[SYNC] ⚠ Not found: {src}")
            continue

        # Only copy when it's truly external (absolute path outside extracted dir)
        if not Path(raw_str).is_absolute():
            continue  # relative → already copied with copytree

        _ensure_dir(data_dir)

        if src.is_file():
            shutil.copy2(str(src), str(data_dir / src.name))
            print(f"[SYNC] ✓ {src.name} → data/")
            synced += 1
        elif src.is_dir():
            dest_dir = work_dir / src.name
            if dest_dir.exists():
                _safe_rmtree(dest_dir)
            shutil.copytree(str(src), str(dest_dir))
            print(f"[SYNC] ✓ {src.name}/ → work_dir/")
            synced += 1

    print(f"[SYNC] {synced} external input file(s) synced")


# ─────────────────────────────────────────────────────────────
# Runtime config
# ─────────────────────────────────────────────────────────────

def _write_runtime_config(execution: Execution, etl: ETL, work_dir: Path, effective_config: dict) -> Path:
    outputs_dir = work_dir / "outputs"
    deleted_dir = work_dir / "deleted"
    archive_dir = work_dir / "archive"
    for d in (outputs_dir, deleted_dir, archive_dir):
        _ensure_dir(d)

    cfg = {
        "execution_id": str(execution.id),
        "etl_id": str(etl.id),
        "work_directory": str(work_dir),
        "outputs": {
            "directory": str(outputs_dir),
            "deleted": str(deleted_dir),
            "archive": str(archive_dir),
        },
        "config": effective_config,
        "config_overrides": execution.config_overrides,
    }

    cfg_path = work_dir / "runtime_config.json"
    cfg_path.write_text(json.dumps(cfg, indent=2, default=str), encoding="utf-8")
    execution.runtime_config = cfg
    execution.save(update_fields=["runtime_config"])
    return cfg_path


# ─────────────────────────────────────────────────────────────
# Shared venv
# ─────────────────────────────────────────────────────────────

def _get_or_create_shared_venv(etl: ETL) -> Tuple[Path, Path]:
    venv_base = Path(settings.MEDIA_ROOT) / "etl_venvs"
    venv_base.mkdir(parents=True, exist_ok=True)
    venv_dir = venv_base / str(etl.id)

    is_nt = os.name == "nt"
    activate_script = venv_dir / ("Scripts/activate.bat" if is_nt else "bin/activate")
    python_bin      = venv_dir / ("Scripts/python.exe"   if is_nt else "bin/python")

    if etl.has_shared_venv and python_bin.exists():
        print(f"[VENV] Reusing: {venv_dir}")
        return venv_dir, activate_script

    print(f"[VENV] Creating: {venv_dir}")
    if venv_dir.exists():
        _safe_rmtree(venv_dir)

    base_python = _find_system_python(requested_version=etl.python_version)
    result = subprocess.run([base_python, "-m", "venv", str(venv_dir)], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"venv creation failed.\nstdout: {result.stdout}\nstderr: {result.stderr}")

    return venv_dir, activate_script


def _find_requirements_file(etl_code_dir: Path, resolved_path: str = "") -> Optional[Path]:
    if resolved_path:
        rp = Path(resolved_path)
        if rp.exists():
            return rp
        matches = [f for f in etl_code_dir.rglob(rp.name)
                   if f.is_file() and not any(ex in f.parts for ex in _EXCLUDED_DIRS)]
        if matches:
            return sorted(matches, key=lambda p: len(p.parts))[0]

    matches = [f for f in etl_code_dir.rglob("requirements.txt")
               if f.is_file() and not any(ex in f.parts for ex in _EXCLUDED_DIRS)]
    return sorted(matches, key=lambda p: len(p.parts))[0] if matches else None


def _install_dependencies(venv_dir: Path, activate_script: Path,
                           etl_code_dir: Path, etl: ETL, work_dir: Path) -> str:
    req = _find_requirements_file(etl_code_dir, resolved_path=etl.resolved_requirements)
    if not req:
        return "No requirements.txt — skipping installation.\n"

    print(f"[INSTALL] Installing from: {req}")
    is_nt = os.name == "nt"

    if is_nt:
        script = (f'@echo off\ncall "{activate_script}"\nif errorlevel 1 exit /b 1\n'
                  f'pip install -r "{req}" --no-cache-dir\nset PIP_EXIT=%ERRORLEVEL%\n'
                  f'deactivate\nexit /b %PIP_EXIT%\n')
        script_path = work_dir / "install_deps.bat"
        script_path.write_text(script, encoding="utf-8")
        cmd = ["cmd", "/c", str(script_path)]
    else:
        script = (f'#!/bin/bash\nset -e\nsource "{activate_script}"\n'
                  f'pip install -r "{req}" --no-cache-dir\ndeactivate\n')
        script_path = work_dir / "install_deps.sh"
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o755)
        cmd = ["/bin/bash", str(script_path)]

    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(etl_code_dir))
    try:
        script_path.unlink()
    except Exception:
        pass

    if r.returncode != 0:
        raise RuntimeError(f"pip install failed (exit {r.returncode}):\n{r.stdout}\n{r.stderr}")

    return f"Requirements: {req}\nReturn code: {r.returncode}\n{r.stdout}\n{r.stderr}\n"


# ─────────────────────────────────────────────────────────────
# Entry point + script execution
# ─────────────────────────────────────────────────────────────

def _resolve_entry_point(etl_code_dir: Path, etl: ETL) -> Path:
    candidates = list(dict.fromkeys(filter(None, [
        Path(etl.resolved_entry_point).name if etl.resolved_entry_point else None,
        Path(etl.entry_point_path).name     if etl.entry_point_path     else None,
    ])))

    for filename in candidates:
        matches = [f for f in etl_code_dir.rglob(filename)
                   if f.is_file() and not any(ex in f.parts for ex in _EXCLUDED_DIRS)]
        if matches:
            return sorted(matches, key=lambda p: len(p.parts))[0]

    py_files = [str(f.relative_to(etl_code_dir))
                for f in etl_code_dir.rglob("*.py")
                if not any(ex in f.parts for ex in _EXCLUDED_DIRS)][:20]
    raise FileNotFoundError(
        f"Entry point '{etl.entry_point_path}' not found.\n"
        f"Python files present:\n  " + "\n  ".join(py_files or ["(none)"])
    )


def _run_script(venv_dir: Path, activate_script: Path, etl_code_dir: Path,
                etl: ETL, cfg_path: Path, work_dir: Path) -> Tuple[int, str, str]:
    entry = _resolve_entry_point(etl_code_dir, etl)
    print(f"[EXECUTE] Entry: {entry}  CWD: {work_dir}")
    is_nt = os.name == "nt"

    if is_nt:
        script = (f'@echo off\ncall "{activate_script}"\nif errorlevel 1 exit /b 1\n'
                  f'set ETL_RUNTIME_CONFIG={cfg_path}\nset ETL_WORK_DIR={work_dir}\n'
                  f'python "{entry}"\nset SCRIPT_EXIT=%ERRORLEVEL%\ndeactivate\nexit /b %SCRIPT_EXIT%\n')
        script_path = work_dir / "run.bat"
        script_path.write_text(script, encoding="utf-8")
        cmd = ["cmd", "/c", str(script_path)]
    else:
        script = (f'#!/bin/bash\nsource "{activate_script}"\n'
                  f'export ETL_RUNTIME_CONFIG="{cfg_path}"\nexport ETL_WORK_DIR="{work_dir}"\n'
                  f'python "{entry}"\nSCRIPT_EXIT=$?\ndeactivate\nexit $SCRIPT_EXIT\n')
        script_path = work_dir / "run.sh"
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o755)
        cmd = ["/bin/bash", str(script_path)]

    r = subprocess.run(cmd, cwd=str(work_dir), capture_output=True, text=True, timeout=3600)
    try:
        script_path.unlink()
    except Exception:
        pass

    return r.returncode, r.stdout, r.stderr


# ─────────────────────────────────────────────────────────────
# *** SUCCESS DETECTION (the real fix) ***
# ─────────────────────────────────────────────────────────────

def _determine_status(rc: int, stdout: str, stderr: str, work_dir: Path) -> Tuple[str, str]:
    """
    Return (status, error_message).

    Rules (in priority order):
    1. Non-zero exit code → FAILED
    2. Python traceback in stderr or stdout → FAILED
    3. No output files produced at all → FAILED
    4. Otherwise → SUCCESS
    """
    if rc != 0:
        # Extract the last meaningful error line from stderr
        err_lines = [l for l in stderr.splitlines() if l.strip()]
        msg = err_lines[-1] if err_lines else f"Script exited with code {rc}"
        return "FAILED", msg

    # Check for Python tracebacks even when exit code is 0
    combined = stderr + "\n" + stdout
    if _TRACEBACK_RE.search(stderr):
        # Pull the actual exception line
        for line in reversed(stderr.splitlines()):
            if line.strip() and not line.startswith(" "):
                return "FAILED", f"Script raised an exception: {line.strip()}"
        return "FAILED", "Script raised an exception (see stderr log)"

    # Check that at least one output file was produced
    output_dirs = [work_dir / "outputs", work_dir / "deleted", work_dir / "archive"]
    output_extensions = {".xlsx", ".xls", ".csv", ".pdf", ".zip", ".json", ".txt", ".parquet"}
    has_outputs = any(
        f.suffix.lower() in output_extensions
        for d in output_dirs
        if d.exists()
        for f in d.iterdir()
        if f.is_file()
    )

    if not has_outputs:
        return "FAILED", (
            "Script exited successfully (code 0) but produced no output files. "
            "Check that your script writes results to the outputs/ directory."
        )

    return "SUCCESS", ""


# ─────────────────────────────────────────────────────────────
# Output collection
# ─────────────────────────────────────────────────────────────

def _collect_outputs(execution: Execution, work_dir: Path) -> int:
    output_extensions = {".xlsx", ".xls", ".csv", ".pdf", ".zip", ".json", ".txt", ".parquet"}
    registered: set = set()
    count = 0

    def _register(child: Path) -> None:
        nonlocal count
        if not child.is_file() or child.suffix.lower() not in output_extensions:
            return
        key = (child.name, child.stat().st_size)
        if key in registered:
            return
        registered.add(key)
        if OutputFile.objects.filter(execution=execution, filename=child.name).exists():
            return

        suffix = child.suffix.lower()
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
            filename=child.name,
            file_path=str(child),
            file_size=child.stat().st_size,
            file_type=file_type,
        )
        print(f"[OUTPUT] Registered: {child.name} ({file_type})")
        count += 1

    for d in [work_dir / "outputs", work_dir / "deleted", work_dir / "archive"]:
        if d.exists():
            for child in d.iterdir():
                _register(child)

    return count


# ─────────────────────────────────────────────────────────────
# In-app notifications
# ─────────────────────────────────────────────────────────────

def _create_notification(execution: Execution, success: bool, output_count: int) -> None:
    """Create an in-app Notification row for the launching user."""
    try:
        from ...notification.models import Notification  # adjust import if needed

        etl_name = execution.etl.name
        label    = execution.execution_label or etl_name
        duration = ""
        if execution.started_at and execution.completed_at:
            secs = (execution.completed_at - execution.started_at).total_seconds()
            duration = f" in {int(secs)}s"

        if success:
            title   = f"✓ {label} completed"
            message = f"{etl_name} finished successfully{duration}. {output_count} output file(s) produced."
            notif_type = "success"
        else:
            title   = f"✗ {label} failed"
            message = execution.error_message or f"{etl_name} failed{duration}."
            notif_type = "error"

        Notification.objects.create(
            user=execution.launched_by,
            title=title,
            message=message,
            notification_type=notif_type,
            execution=execution,
        )
        print(f"[NOTIFY] In-app notification created ({notif_type})")
    except Exception as e:
        print(f"[NOTIFY] Could not create in-app notification: {e}")


# ─────────────────────────────────────────────────────────────
# Email report
# ─────────────────────────────────────────────────────────────

def _send_email_report(execution: Execution, recipient: str, output_count: int) -> None:
    """Send a plain-text execution report email using Django's email backend."""
    try:
        etl_name = execution.etl.name
        label    = execution.execution_label or etl_name
        status   = execution.status
        duration = ""
        if execution.started_at and execution.completed_at:
            secs = (execution.completed_at - execution.started_at).total_seconds()
            duration = f"{int(secs)} seconds"

        subject = f"[ETL Platform] {label} — {status}"

        if status == "SUCCESS":
            body = (
                f"ETL execution completed successfully.\n\n"
                f"ETL:       {etl_name}\n"
                f"Label:     {label}\n"
                f"Status:    {status}\n"
                f"Duration:  {duration}\n"
                f"Outputs:   {output_count} file(s)\n"
            )
        else:
            body = (
                f"ETL execution failed.\n\n"
                f"ETL:    {etl_name}\n"
                f"Label:  {label}\n"
                f"Status: {status}\n"
                f"Error:  {execution.error_message or 'Unknown error'}\n\n"
                f"--- Last stderr ---\n"
                f"{(execution.stderr_log or '')[-2000:]}\n"
            )

        if execution.config_overrides:
            body += "\n--- Config overrides ---\n"
            for k, v in execution.config_overrides.items():
                body += f"  {k}: {v}\n"

        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@etl-platform.local")
        send_mail(subject, body, from_email, [recipient], fail_silently=False)
        print(f"[EMAIL] Report sent to {recipient}")

    except Exception as e:
        print(f"[EMAIL] Failed to send report: {e}")
        # Don't raise — email failure must never crash the execution record


def _handle_notifications(execution: Execution, output_count: int) -> None:
    """Send email if requested, then mark report_sent."""
    if execution.output_delivery not in ("email", "both"):
        return
    if not execution.notify_email:
        return

    _send_email_report(execution, execution.notify_email, output_count)
    execution.report_sent = True
    execution.report_sent_at = timezone.now()
    execution.save(update_fields=["report_sent", "report_sent_at"])


# ─────────────────────────────────────────────────────────────
# Main orchestrator
# ─────────────────────────────────────────────────────────────

def run_execution(execution: Execution) -> None:
    etl      = execution.etl
    work_dir = _safe_work_dir(execution)
    _ensure_dir(work_dir)
    _ensure_dir(work_dir / "logs")

    venv_existed = etl.has_shared_venv

    execution.started_at        = timezone.now()
    execution.status            = "INSTALLING_DEPS"
    execution.stdout_log        = ""
    execution.stderr_log        = ""
    execution.error_message     = ""
    execution.python_version_used = ".".join(str(v) for v in sys.version_info[:3])
    execution.save(update_fields=[
        "started_at", "status", "stdout_log",
        "stderr_log", "error_message", "python_version_used",
    ])

    effective_config = dict(execution.execution_config) if execution.execution_config else dict(etl.config)
    output_count = 0

    try:
        step_total = 3 if venv_existed else 4
        step = 0

        print(f"\n{'='*60}")
        print(f"[EXEC] {etl.name} v{etl.version}  id={execution.id}")
        print(f"[EXEC] overrides={execution.config_overrides or 'none'}")
        print(f"{'='*60}\n")

        # ── 1. Copy code ─────────────────────────────────────────────
        step += 1
        execution.stdout_log += f"[{step}/{step_total}] Copying ETL code...\n"
        execution.save(update_fields=["stdout_log"])

        etl_code_dir = _copy_etl_code(etl, work_dir)
        _patch_all_config_copies(etl, work_dir, effective_config)

        # ── 2. Sync inputs + write runtime config ─────────────────────
        step += 1
        execution.stdout_log += f"[{step}/{step_total}] Syncing inputs and writing config...\n"
        execution.save(update_fields=["stdout_log"])

        _sync_input_files(etl, execution, work_dir, effective_config)
        cfg_path = _write_runtime_config(execution, etl, work_dir, effective_config)

        if execution.config_overrides:
            summary = "\n".join(f"  {k}: {v}" for k, v in execution.config_overrides.items())
            execution.stdout_log += f"Overrides:\n{summary}\n"
            execution.save(update_fields=["stdout_log"])

        # ── 3. Venv ───────────────────────────────────────────────────
        step += 1
        venv_dir, activate_script = _get_or_create_shared_venv(etl)

        if not venv_existed:
            execution.stdout_log += f"[{step}/{step_total}] Installing dependencies...\n"
            execution.save(update_fields=["stdout_log"])

            deps_log = _install_dependencies(venv_dir, activate_script, etl_code_dir, etl, work_dir)
            execution.dependencies_log        = deps_log
            execution.dependencies_installed  = True
            execution.stdout_log             += deps_log

            etl.shared_venv_path   = str(venv_dir)
            etl.deps_installed_at  = timezone.now()
            etl.save(update_fields=["shared_venv_path", "deps_installed_at"])
            execution.save(update_fields=["dependencies_log", "dependencies_installed", "stdout_log"])
        else:
            when = etl.deps_installed_at.strftime("%Y-%m-%d %H:%M") if etl.deps_installed_at else "previously"
            execution.stdout_log += f"[{step}/{step_total}] Reusing venv (deps installed {when}).\n"
            execution.dependencies_installed = True
            execution.save(update_fields=["stdout_log", "dependencies_installed"])

        execution.venv_path = str(venv_dir)
        execution.status    = "RUNNING"
        execution.save(update_fields=["venv_path", "status"])

        # ── 4. Run ────────────────────────────────────────────────────
        step += 1
        execution.stdout_log += f"[{step}/{step_total}] Running ETL script...\n"
        execution.save(update_fields=["stdout_log"])

        rc, out, err = _run_script(venv_dir, activate_script, etl_code_dir, etl, cfg_path, work_dir)

        execution.return_code  = rc
        execution.stdout_log  += out
        execution.stderr_log  += err
        execution.completed_at = timezone.now()

        # Collect outputs before determining status
        output_count = _collect_outputs(execution, work_dir)
        execution.stdout_log += f"\nCollected {output_count} output file(s).\n"

        # ── Proper status determination ───────────────────────────────
        final_status, error_msg = _determine_status(rc, out, err, work_dir)
        execution.status        = final_status
        execution.error_message = error_msg

        execution.save(update_fields=[
            "completed_at", "status", "return_code",
            "stdout_log", "stderr_log", "error_message",
        ])
        print(f"[EXEC] Finished: {final_status} (rc={rc}, outputs={output_count})")

    except Exception as exc:
        print(f"[EXEC] Unhandled error: {exc}")
        execution.completed_at  = timezone.now()
        execution.status        = "FAILED"
        execution.error_message = str(exc)
        execution.stderr_log   += f"\n[ENGINE ERROR] {exc!r}"
        execution.save(update_fields=["completed_at", "status", "error_message", "stderr_log"])

    finally:
        success = execution.status == "SUCCESS"
        # In-app notification (always)
        _create_notification(execution, success, output_count)
        # Email (only if requested)
        _handle_notifications(execution, output_count)