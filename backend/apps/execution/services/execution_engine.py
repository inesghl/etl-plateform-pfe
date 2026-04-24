"""
execution/services/execution_engine.py
───────────────────────────────────────
Fixes applied vs previous version:

  BUG A  _sync_input_files() now patches effective_config[key] after copying
         an absolute input to work_dir/data/ so the script reads the local copy.

  BUG B  _prepare_output_dirs() heuristic simplified — always creates the
         parent directory; also creates the path itself when it has no suffix
         (i.e. looks like a directory).

  BUG C  _collect_outputs() resolves classified output paths against work_dir,
         not etl.extracted_path.

  BUG D  _determine_status() checks execution.output_files.exists() (the DB
         records populated by _collect_outputs) before falling back to scanning
         the standard dirs. This is the fix for "always SUCCESS" — status is
         now determined from what was actually found on disk, not a stale path
         resolution.

  EXTRA  _find_requirements_file() gracefully handles missing requirements.txt
         without raising — the engine simply skips pip install and continues.
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

# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────

_EXCLUDED_DIRS = {
    ".venv", "venv", "__pycache__", ".git",
    "node_modules", ".tox", ".mypy_cache", ".idea", ".vscode",
}

_TRACEBACK_RE = re.compile(
    r"(Traceback \(most recent call last\)|"
    r"Error:|Exception:|raise \w+|"
    r"SyntaxError:|AttributeError:|KeyError:|ValueError:|TypeError:|"
    r"FileNotFoundError:|PermissionError:|ImportError:)",
    re.IGNORECASE,
)

OUTPUT_EXTENSIONS = {
    ".xlsx", ".xls", ".csv", ".pdf", ".zip",
    ".json", ".txt", ".parquet",
}


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


def _merged_classifications(etl: ETL, execution: Execution) -> dict:
    """Merge ETL-level and execution-level path classifications.
    Execution-level overrides ETL-level."""
    return {**etl.path_classifications, **execution.path_classifications}


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
            if n in _EXCLUDED_DIRS
            or n.lower().startswith(".venv")
            or n.lower().startswith("venv")
        }

    shutil.copytree(str(source), str(dest), ignore=_ignore)

    # Mirror common resource folders at work_dir root so CWD-relative opens work.
    # This is for ETL-bundled reference data (mappings, templates, etc.) —
    # NOT for input data files, which are handled by _sync_input_files.
    for folder_name in ["config", "resources", "assets", "templates", "mappings"]:
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
    """Overwrite every copy of the config file found inside work_dir so the
    script always sees the merged execution-level config, regardless of how it
    opens the file (relative or absolute path)."""
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
# Sync input files into work_dir
# ─────────────────────────────────────────────────────────────

def _sync_input_files(
    etl: ETL,
    execution: Execution,
    work_dir: Path,
    effective_config: dict,  # MUTATED in-place: absolute input paths are rewritten
) -> None:
    """
    For each config key classified as 'input':

    Absolute path (e.g. "D:/reports/clients.xlsx"):
      - Copy the file/dir into work_dir/data/ so the script has a local copy.
      - Patch effective_config[key] to point at the local copy so the script
        opens it successfully regardless of network/permission issues on the
        original location.  (BUG A fix)

    Relative path (e.g. "data/input.xlsx"):
      - Mirror from work_dir/etl_code/<rel> to work_dir/<rel> so the script
        can open it using a CWD-relative path (CWD = work_dir at runtime).

    Non-existent absolute input:
      - Log a warning but continue — the script may handle missing files itself,
        or the path may be intentionally created by a preceding step.
    """
    classifications = _merged_classifications(etl, execution)
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
        p_raw = Path(raw_str)

        if p_raw.is_absolute():
            # ── Absolute external path ────────────────────────────────
            src = p_raw
            if not src.exists():
                print(f"[SYNC] Warning: absolute input not found: {src}")
                # Leave config as-is; script may cope or fail meaningfully
                continue

            _ensure_dir(data_dir)

            if src.is_file():
                dest_file = data_dir / src.name
                shutil.copy2(str(src), str(dest_file))
                print(f"[SYNC] ✓ Copied absolute input: {src.name} → data/")
                # BUG A fix: rewrite config so the script finds the local copy
                effective_config[key] = str(dest_file)
                synced += 1

            elif src.is_dir():
                dest_dir = work_dir / src.name
                if dest_dir.exists():
                    _safe_rmtree(dest_dir)
                shutil.copytree(str(src), str(dest_dir))
                print(f"[SYNC] ✓ Copied absolute input dir: {src.name}/ → work_dir/")
                # Rewrite to local copy
                effective_config[key] = str(dest_dir)
                synced += 1

        else:
            # ── Relative path — mirror from etl_code to work_dir root ─
            src_in_code = (work_dir / "etl_code" / p_raw).resolve()
            dst_from_root = (work_dir / p_raw).resolve()

            if src_in_code.exists() and not dst_from_root.exists():
                dst_from_root.parent.mkdir(parents=True, exist_ok=True)
                if src_in_code.is_file():
                    shutil.copy2(str(src_in_code), str(dst_from_root))
                    print(f"[SYNC] ✓ Mirrored relative input: {raw_str}")
                    synced += 1
                elif src_in_code.is_dir():
                    shutil.copytree(str(src_in_code), str(dst_from_root))
                    print(f"[SYNC] ✓ Mirrored relative input dir: {raw_str}")
                    synced += 1
            elif not src_in_code.exists():
                print(f"[SYNC] Warning: relative input not found in etl_code: {raw_str}")

    print(f"[SYNC] {synced} input(s) synced")


# ─────────────────────────────────────────────────────────────
# Prepare output directories before script runs
# ─────────────────────────────────────────────────────────────

def _prepare_output_dirs(
    etl: ETL,
    execution: Execution,
    work_dir: Path,
    effective_config: dict,
) -> None:
    """
    For every config key classified as 'output', resolve the path and ensure
    its parent directory (and, if the path itself has no suffix, the directory
    itself) exists before the script starts.

    This prevents FileNotFoundError when the script tries to write to a
    directory that doesn't exist yet — common on first runs.

    Relative paths are resolved against work_dir (the script's CWD).
    Absolute paths that point outside work_dir are created as-is.

    BUG B fix: simplified heuristic — always create parent; also create the
    directory itself when the path has no file extension (looks like a dir).
    """
    classifications = _merged_classifications(etl, execution)

    for key, classification in classifications.items():
        if classification != "output":
            continue

        raw_val = resolve_config_key(effective_config, key)
        if not raw_val:
            continue

        raw_str = str(raw_val)
        p = Path(raw_str)

        # Resolve relative paths against work_dir
        if not p.is_absolute():
            p = (work_dir / p).resolve()

        # Always ensure the parent exists
        p.parent.mkdir(parents=True, exist_ok=True)

        # If no suffix, the path itself is a directory — create it too
        if not Path(raw_str).suffix:
            p.mkdir(parents=True, exist_ok=True)
            print(f"[OUTPUT_DIR] ✓ Created dir: {p}")
        else:
            print(f"[OUTPUT_DIR] ✓ Created parent dir: {p.parent}")


# ─────────────────────────────────────────────────────────────
# Runtime config
# ─────────────────────────────────────────────────────────────

def _write_runtime_config(
    execution: Execution,
    etl: ETL,
    work_dir: Path,
    effective_config: dict,
) -> Path:
    """Write runtime_config.json into work_dir and update the DB record.

    The three standard output sub-dirs (outputs/, deleted/, archive/) are
    created here. Scripts that don't use classified output paths can always
    write to work_dir/outputs/ and be collected automatically.
    """
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
    python_bin = venv_dir / ("Scripts/python.exe" if is_nt else "bin/python")

    if etl.has_shared_venv and python_bin.exists():
        print(f"[VENV] Reusing: {venv_dir}")
        return venv_dir, activate_script

    print(f"[VENV] Creating: {venv_dir}")
    if venv_dir.exists():
        _safe_rmtree(venv_dir)

    base_python = _find_system_python(requested_version=etl.python_version)
    result = subprocess.run(
        [base_python, "-m", "venv", str(venv_dir)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"venv creation failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
        )

    return venv_dir, activate_script


def _find_requirements_file(
    etl_code_dir: Path,
    resolved_path: str = "",
) -> Optional[Path]:
    """
    Find requirements.txt for the ETL.

    Resolution order:
      1. If resolved_path is given and the file exists, use it directly.
      2. Search for the filename of resolved_path anywhere inside etl_code_dir.
      3. Auto-discover any requirements.txt in etl_code_dir (shallowest first).

    Returns None if no requirements file is found — caller skips pip install.
    """
    if resolved_path:
        rp = Path(resolved_path)
        if rp.exists():
            return rp
        # Search by filename only (resolved_path may be from a different run)
        matches = [
            f for f in etl_code_dir.rglob(rp.name)
            if f.is_file() and not any(ex in f.parts for ex in _EXCLUDED_DIRS)
        ]
        if matches:
            return sorted(matches, key=lambda p: len(p.parts))[0]

    # Auto-discover
    matches = [
        f for f in etl_code_dir.rglob("requirements.txt")
        if f.is_file() and not any(ex in f.parts for ex in _EXCLUDED_DIRS)
    ]
    return sorted(matches, key=lambda p: len(p.parts))[0] if matches else None


def _install_dependencies(
    venv_dir: Path,
    activate_script: Path,
    etl_code_dir: Path,
    etl: ETL,
    work_dir: Path,
) -> str:
    req = _find_requirements_file(etl_code_dir, resolved_path=etl.resolved_requirements)
    if not req:
        msg = "No requirements.txt found — skipping dependency installation.\n"
        print(f"[INSTALL] {msg.strip()}")
        return msg

    print(f"[INSTALL] Installing from: {req}")
    is_nt = os.name == "nt"

    if is_nt:
        script = (
            f'@echo off\ncall "{activate_script}"\nif errorlevel 1 exit /b 1\n'
            f'pip install -r "{req}" --no-cache-dir\nset PIP_EXIT=%ERRORLEVEL%\n'
            f'deactivate\nexit /b %PIP_EXIT%\n'
        )
        script_path = work_dir / "install_deps.bat"
        script_path.write_text(script, encoding="utf-8")
        cmd = ["cmd", "/c", str(script_path)]
    else:
        script = (
            f'#!/bin/bash\nset -e\nsource "{activate_script}"\n'
            f'pip install -r "{req}" --no-cache-dir\ndeactivate\n'
        )
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
        raise RuntimeError(
            f"pip install failed (exit {r.returncode}):\n{r.stdout}\n{r.stderr}"
        )

    return f"Requirements: {req}\nReturn code: {r.returncode}\n{r.stdout}\n{r.stderr}\n"


# ─────────────────────────────────────────────────────────────
# Entry point + script execution
# ─────────────────────────────────────────────────────────────

def _resolve_entry_point(etl_code_dir: Path, etl: ETL) -> Path:
    candidates = list(dict.fromkeys(filter(None, [
        Path(etl.resolved_entry_point).name if etl.resolved_entry_point else None,
        Path(etl.entry_point_path).name if etl.entry_point_path else None,
    ])))

    for filename in candidates:
        matches = [
            f for f in etl_code_dir.rglob(filename)
            if f.is_file() and not any(ex in f.parts for ex in _EXCLUDED_DIRS)
        ]
        if matches:
            return sorted(matches, key=lambda p: len(p.parts))[0]

    py_files = [
        str(f.relative_to(etl_code_dir))
        for f in etl_code_dir.rglob("*.py")
        if not any(ex in f.parts for ex in _EXCLUDED_DIRS)
    ][:20]
    raise FileNotFoundError(
        f"Entry point '{etl.entry_point_path}' not found in etl_code.\n"
        f"Python files present:\n  " + "\n  ".join(py_files or ["(none)"])
    )


def _run_script(
    venv_dir: Path,
    activate_script: Path,
    etl_code_dir: Path,
    etl: ETL,
    cfg_path: Path,
    work_dir: Path,
) -> Tuple[int, str, str]:
    entry = _resolve_entry_point(etl_code_dir, etl)
    print(f"[EXECUTE] Entry: {entry}  CWD: {work_dir}")
    is_nt = os.name == "nt"

    if is_nt:
        script = (
            f'@echo off\ncall "{activate_script}"\nif errorlevel 1 exit /b 1\n'
            f'set ETL_RUNTIME_CONFIG={cfg_path}\nset ETL_WORK_DIR={work_dir}\n'
            f'python "{entry}"\nset SCRIPT_EXIT=%ERRORLEVEL%\ndeactivate\nexit /b %SCRIPT_EXIT%\n'
        )
        script_path = work_dir / "run.bat"
        script_path.write_text(script, encoding="utf-8")
        cmd = ["cmd", "/c", str(script_path)]
    else:
        script = (
            f'#!/bin/bash\nsource "{activate_script}"\n'
            f'export ETL_RUNTIME_CONFIG="{cfg_path}"\nexport ETL_WORK_DIR="{work_dir}"\n'
            f'python "{entry}"\nSCRIPT_EXIT=$?\ndeactivate\nexit $SCRIPT_EXIT\n'
        )
        script_path = work_dir / "run.sh"
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o755)
        cmd = ["/bin/bash", str(script_path)]

    r = subprocess.run(
        cmd,
        cwd=str(work_dir),  # Script's CWD = work_dir; relative paths work from here
        capture_output=True,
        text=True,
        timeout=3600,
    )
    try:
        script_path.unlink()
    except Exception:
        pass

    return r.returncode, r.stdout, r.stderr


# ─────────────────────────────────────────────────────────────
# Output collection
# ─────────────────────────────────────────────────────────────

def _collect_outputs(
    execution: Execution,
    work_dir: Path,
    effective_config: dict = None,
) -> int:
    """
    Register all output files produced by the script as OutputFile DB records.

    Scans in order:
      1. The three standard work_dir dirs: outputs/, deleted/, archive/
      2. Every config key classified as 'output' — resolved against work_dir
         (BUG C fix: was incorrectly using etl.extracted_path)

    Deduplicates by (filename, size) so the same physical file is never
    registered twice even if it appears in both scan passes.
    """
    registered: set = set()
    count = 0

    def _register(child: Path) -> None:
        nonlocal count
        if not child.is_file() or child.suffix.lower() not in OUTPUT_EXTENSIONS:
            return
        dedup_key = (child.name, child.stat().st_size)
        if dedup_key in registered:
            return
        registered.add(dedup_key)
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
        print(f"[OUTPUT] Registered: {child.name} ({file_type}, {child.stat().st_size} bytes)")
        count += 1

    # 1. Standard work_dir output directories
    for d in [work_dir / "outputs", work_dir / "deleted", work_dir / "archive"]:
        if d.exists():
            for child in d.iterdir():
                _register(child)

    # 2. Classified output paths from the execution config
    # BUG C fix: resolve against work_dir, not etl.extracted_path
    if effective_config:
        etl = execution.etl
        classifications = _merged_classifications(etl, execution)

        for key, cls in classifications.items():
            if cls != "output":
                continue

            raw_val = resolve_config_key(effective_config, key)
            if not raw_val:
                continue

            raw_str = str(raw_val)
            p = Path(raw_str)

            # Resolve relative paths against work_dir (script's CWD)
            if not p.is_absolute():
                p = (work_dir / p).resolve()

            if p.is_file():
                _register(p)
            elif p.is_dir() and p.exists():
                for child in p.iterdir():
                    _register(child)

    return count


# ─────────────────────────────────────────────────────────────
# Success detection
# ─────────────────────────────────────────────────────────────

def _determine_status(
    rc: int,
    stdout: str,
    stderr: str,
    work_dir: Path,
    execution: Execution = None,
    # kept for backwards compat but no longer needed for path resolution:
    effective_config: dict = None,
    etl: ETL = None,
) -> Tuple[str, str]:
    """
    Return (status, error_message).

    Priority order:
      1. Non-zero exit code → FAILED
      2. Python traceback in stderr → FAILED
      3. DB output records exist (populated by _collect_outputs just before
         this call) → SUCCESS  (BUG D fix — reliable, no path re-resolution)
      4. Standard work_dir dirs contain output files → SUCCESS
      5. Nothing found → FAILED
    """
    # ── 1. Exit code ──────────────────────────────────────────
    if rc != 0:
        err_lines = [l for l in stderr.splitlines() if l.strip()]
        msg = err_lines[-1] if err_lines else f"Script exited with code {rc}"
        return "FAILED", msg

    # ── 2. Traceback in stderr ────────────────────────────────
    if _TRACEBACK_RE.search(stderr):
        for line in reversed(stderr.splitlines()):
            if line.strip() and not line.startswith(" "):
                return "FAILED", f"Script raised an exception: {line.strip()}"
        return "FAILED", "Script raised an exception (see stderr log)"

    # ── 3. DB records (BUG D fix) ─────────────────────────────
    # _collect_outputs() ran just before this — if any files were found and
    # registered, trust those records as the source of truth.
    if execution is not None and execution.output_files.exists():
        return "SUCCESS", ""

    # ── 4. Fallback: scan standard work_dir dirs ──────────────
    standard_dirs = [work_dir / "outputs", work_dir / "deleted", work_dir / "archive"]
    has_outputs = any(
        f.suffix.lower() in OUTPUT_EXTENSIONS
        for d in standard_dirs
        if d.exists()
        for f in d.iterdir()
        if f.is_file()
    )
    if has_outputs:
        return "SUCCESS", ""

    # ── 5. No outputs found ───────────────────────────────────
    return "FAILED", (
        "Script exited successfully (code 0) but produced no output files. "
        "Check that your script writes results to the configured output path."
    )


# ─────────────────────────────────────────────────────────────
# In-app notifications
# ─────────────────────────────────────────────────────────────

def _create_notification(execution: Execution, success: bool, output_count: int) -> None:
    """Create an in-app Notification row for the launching user."""
    try:
        from ...notification.models import Notification

        etl_name = execution.etl.name
        label = execution.execution_label or etl_name
        duration = ""
        if execution.started_at and execution.completed_at:
            secs = (execution.completed_at - execution.started_at).total_seconds()
            duration = f" in {int(secs)}s"

        if success:
            title = f"✓ {label} completed"
            message = (
                f"{etl_name} finished successfully{duration}. "
                f"{output_count} output file(s) produced."
            )
            notif_type = "success"
        else:
            title = f"✗ {label} failed"
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
        label = execution.execution_label or etl_name
        exec_status = execution.status
        duration = ""
        if execution.started_at and execution.completed_at:
            secs = (execution.completed_at - execution.started_at).total_seconds()
            duration = f"{int(secs)} seconds"

        subject = f"[ETL Platform] {label} — {exec_status}"

        if exec_status == "SUCCESS":
            body = (
                f"ETL execution completed successfully.\n\n"
                f"ETL:       {etl_name}\n"
                f"Label:     {label}\n"
                f"Status:    {exec_status}\n"
                f"Duration:  {duration}\n"
                f"Outputs:   {output_count} file(s)\n"
            )
        else:
            body = (
                f"ETL execution failed.\n\n"
                f"ETL:    {etl_name}\n"
                f"Label:  {label}\n"
                f"Status: {exec_status}\n"
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
        # Never raise — email failure must not crash the execution record


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
    """
    Full pipeline:
      1. Copy ETL code into work_dir/etl_code/
      2. Sync input files + patch effective_config with local paths
      3. Write runtime_config.json (with patched config)
      4. Patch all config file copies in work_dir (with patched config)
      5. Prepare output directories
      6. Create/reuse shared venv
      7. Install dependencies (if new venv)
      8. Run the ETL script
      9. Collect outputs → register OutputFile records
     10. Determine SUCCESS/FAILED
     11. Send notifications / email
    """
    etl = execution.etl
    work_dir = _safe_work_dir(execution)
    _ensure_dir(work_dir)
    _ensure_dir(work_dir / "logs")

    venv_existed = etl.has_shared_venv

    execution.started_at = timezone.now()
    execution.status = "INSTALLING_DEPS"
    execution.stdout_log = ""
    execution.stderr_log = ""
    execution.error_message = ""
    execution.python_version_used = ".".join(str(v) for v in sys.version_info[:3])
    execution.save(update_fields=[
        "started_at", "status", "stdout_log",
        "stderr_log", "error_message", "python_version_used",
    ])

    # Work on a mutable copy — _sync_input_files will rewrite absolute input
    # paths to their local work_dir/data/ copies (BUG A fix).
    effective_config: dict = (
        dict(execution.execution_config)
        if execution.execution_config
        else dict(etl.config)
    )
    output_count = 0

    try:
        step_total = 3 if venv_existed else 4
        step = 0

        print(f"\n{'=' * 60}")
        print(f"[EXEC] {etl.name} v{etl.version}  id={execution.id}")
        print(f"[EXEC] overrides={execution.config_overrides or 'none'}")
        print(f"{'=' * 60}\n")

        # ── 1. Copy code ──────────────────────────────────────────────
        step += 1
        execution.stdout_log += f"[{step}/{step_total}] Copying ETL code...\n"
        execution.save(update_fields=["stdout_log"])

        etl_code_dir = _copy_etl_code(etl, work_dir)

        # ── 2. Sync inputs (mutates effective_config) ─────────────────
        step += 1
        execution.stdout_log += f"[{step}/{step_total}] Syncing inputs...\n"
        execution.save(update_fields=["stdout_log"])

        # BUG A fix: effective_config is mutated here — absolute input paths
        # are rewritten to work_dir/data/<filename> after the file is copied.
        _sync_input_files(etl, execution, work_dir, effective_config)

        # ── 3. Write runtime config + patch config files ──────────────
        # Must happen AFTER _sync_input_files so the patched paths are baked in.
        cfg_path = _write_runtime_config(execution, etl, work_dir, effective_config)
        _patch_all_config_copies(etl, work_dir, effective_config)

        # ── 4. Prepare output dirs ────────────────────────────────────
        _prepare_output_dirs(etl, execution, work_dir, effective_config)

        if execution.config_overrides:
            summary = "\n".join(f"  {k}: {v}" for k, v in execution.config_overrides.items())
            execution.stdout_log += f"Config overrides:\n{summary}\n"
            execution.save(update_fields=["stdout_log"])

        # ── 5. Venv ───────────────────────────────────────────────────
        step += 1
        venv_dir, activate_script = _get_or_create_shared_venv(etl)

        if not venv_existed:
            execution.stdout_log += f"[{step}/{step_total}] Installing dependencies...\n"
            execution.save(update_fields=["stdout_log"])

            deps_log = _install_dependencies(venv_dir, activate_script, etl_code_dir, etl, work_dir)
            execution.dependencies_log = deps_log
            execution.dependencies_installed = True
            execution.stdout_log += deps_log

            etl.shared_venv_path = str(venv_dir)
            etl.deps_installed_at = timezone.now()
            etl.save(update_fields=["shared_venv_path", "deps_installed_at"])
            execution.save(update_fields=["dependencies_log", "dependencies_installed", "stdout_log"])
        else:
            when = (
                etl.deps_installed_at.strftime("%Y-%m-%d %H:%M")
                if etl.deps_installed_at else "previously"
            )
            execution.stdout_log += (
                f"[{step}/{step_total}] Reusing venv (deps installed {when}).\n"
            )
            execution.dependencies_installed = True
            execution.save(update_fields=["stdout_log", "dependencies_installed"])

        execution.venv_path = str(venv_dir)
        execution.status = "RUNNING"
        execution.save(update_fields=["venv_path", "status"])

        # ── 6. Run ────────────────────────────────────────────────────
        step += 1
        execution.stdout_log += f"[{step}/{step_total}] Running ETL script...\n"
        execution.save(update_fields=["stdout_log"])

        rc, out, err = _run_script(
            venv_dir, activate_script, etl_code_dir, etl, cfg_path, work_dir
        )

        execution.return_code = rc
        execution.stdout_log += out
        execution.stderr_log += err
        execution.completed_at = timezone.now()

        # ── 7. Collect outputs ────────────────────────────────────────
        # Must run BEFORE _determine_status so the DB records exist for check 3.
        # BUG C fix: _collect_outputs now resolves paths against work_dir.
        output_count = _collect_outputs(execution, work_dir, effective_config)
        execution.stdout_log += f"\nCollected {output_count} output file(s).\n"

        # ── 8. Determine status ───────────────────────────────────────
        # BUG D fix: checks execution.output_files.exists() (DB records) first.
        final_status, error_msg = _determine_status(
            rc, out, err, work_dir,
            execution=execution,
        )
        execution.status = final_status
        execution.error_message = error_msg

        execution.save(update_fields=[
            "completed_at", "status", "return_code",
            "stdout_log", "stderr_log", "error_message",
        ])
        print(f"[EXEC] Finished: {final_status} (rc={rc}, outputs={output_count})")

    except Exception as exc:
        print(f"[EXEC] Unhandled error: {exc}")
        execution.completed_at = timezone.now()
        execution.status = "FAILED"
        execution.error_message = str(exc)
        execution.stderr_log += f"\n[ENGINE ERROR] {exc!r}"
        execution.save(update_fields=[
            "completed_at", "status", "error_message", "stderr_log"
        ])

    finally:
        success = execution.status == "SUCCESS"
        _create_notification(execution, success, output_count)
        _handle_notifications(execution, output_count)