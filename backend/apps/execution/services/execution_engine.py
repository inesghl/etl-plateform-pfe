import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from typing import Dict, Tuple

from django.conf import settings
from django.utils import timezone

from ..models import Execution
from ...etl.models import ETL
from ...output_file.models import OutputFile

_EXCLUDED_DIRS = {
    ".venv", "venv", "__pycache__", ".git",
    "node_modules", ".tox", ".mypy_cache", ".idea", ".vscode",
}


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


def _find_system_python() -> str:
    def _in_venv(p: str) -> bool:
        lp = p.replace("\\", "/").lower()
        return "/.venv/" in lp or "/venv/" in lp

    override = os.environ.get("ETL_EXECUTOR_PYTHON", "").strip()
    if override and Path(override).exists():
        return override

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
            return py

    for name in ("python3", "python", "python3.exe", "python.exe"):
        found = shutil.which(name)
        if found and not _in_venv(found):
            return found

    return sys.executable


def _copy_inputs(execution: Execution, work_dir: Path) -> Dict[str, str]:
    """
    User uploads are already in executions/<uuid>/inputs/ folder.
    Just need to replace default files in data/ folder.
    """
    inputs_dir = work_dir / "inputs"
    key_to_path: Dict[str, str] = {}

    input_files = execution.input_files.all()
    print(f"\n{'=' * 60}")
    print(f"[COPY_INPUTS] Found {input_files.count()} uploaded input files")
    print(f"{'=' * 60}")

    for inp in input_files:
        # File is ALREADY in the right place!
        src = Path(inp.uploaded_file.path)

        if not src.exists():
            print(f"[COPY_INPUTS] ❌ ERROR: File not found: {src}")
            continue

        # Verify it's in the inputs folder
        if inputs_dir not in src.parents:
            print(f"[COPY_INPUTS] ⚠️  File not in inputs folder, copying...")
            dest = inputs_dir / inp.original_filename
            shutil.copy2(src, dest)
            src = dest

        key_to_path[inp.file_key] = str(src)

        print(f"[COPY_INPUTS] ✓ Input file:")
        print(f"               Key: {inp.file_key}")
        print(f"               File: {inp.original_filename}")
        print(f"               Path: {src}")

        # Replace default file in data/ folder
        data_folder = work_dir / "data"
        if data_folder.exists():
            print(f"[COPY_INPUTS] 🔍 Searching data/ folder for files to replace...")

            # Try exact filename match
            exact_match = data_folder / inp.original_filename
            if exact_match.exists():
                backup = exact_match.with_suffix(exact_match.suffix + '.original')
                shutil.copy2(str(exact_match), str(backup))
                shutil.copy2(str(src), str(exact_match))
                print(f"[COPY_INPUTS] 🔄 REPLACED: data/{exact_match.name}")
                print(f"               Backup: {backup.name}")
                continue

            # Try fuzzy match by file_key
            for data_file in data_folder.iterdir():
                if not data_file.is_file():
                    continue

                file_key_lower = inp.file_key.lower()
                data_name_lower = data_file.stem.lower()

                if file_key_lower == data_name_lower or file_key_lower in data_name_lower:
                    backup = data_file.with_suffix(data_file.suffix + '.original')
                    shutil.copy2(str(data_file), str(backup))
                    shutil.copy2(str(src), str(data_file))
                    print(f"[COPY_INPUTS] 🔄 REPLACED: data/{data_file.name}")
                    print(f"               With: {inp.original_filename}")
                    print(f"               Backup: {backup.name}")
                    break
            else:
                print(f"[COPY_INPUTS] ⚠️  No matching file in data/ for key '{inp.file_key}'")

    if not key_to_path:
        print(f"[COPY_INPUTS] ℹ️  No user uploads, ETL will use defaults")

    print(f"{'=' * 60}\n")
    return key_to_path

def _copy_etl_code(etl: ETL, work_dir: Path) -> Path:
    source = Path(etl.extracted_path)
    if not source.exists():
        raise FileNotFoundError(f"Extracted ETL path missing: {source}")

    dest = work_dir / "etl_code"
    _safe_rmtree(dest)

    def _ignore(src: str, names: list) -> set:
        skip = set()
        for n in names:
            nl = n.lower()
            if n in _EXCLUDED_DIRS or nl.startswith(".venv") or nl.startswith("venv"):
                skip.add(n)
        return skip

    shutil.copytree(str(source), str(dest), ignore=_ignore)

    # Copy common resource folders to work_dir root
    common_folders = ["config", "data", "resources", "assets", "templates"]

    for folder_name in common_folders:
        etl_folder = None
        for folder in dest.rglob(folder_name):
            if folder.is_dir():
                etl_folder = folder
                break

        if etl_folder:
            target_folder = work_dir / folder_name
            if target_folder.exists():
                _safe_rmtree(target_folder)
            shutil.copytree(str(etl_folder), str(target_folder))
            print(f"[EXECUTION] Copied {folder_name}/ folder to: {target_folder}")

    return dest


def _write_runtime_config(
        execution: Execution, etl: ETL, work_dir: Path, input_paths: Dict[str, str]
) -> Path:
    # Create all output directories
    outputs_dir = work_dir / "outputs"
    _ensure_dir(outputs_dir)

    deleted_dir = work_dir / "deleted"
    _ensure_dir(deleted_dir)

    archive_dir = work_dir / "archive"
    _ensure_dir(archive_dir)

    cfg = {
        "execution_id": str(execution.id),
        "etl_id": str(etl.id),
        "work_directory": str(work_dir),
        "inputs": input_paths,
        "outputs": {
            "directory": str(outputs_dir),
            "deleted": str(deleted_dir),
            "archive": str(archive_dir)
        },
        "config": etl.config,
    }
    cfg_path = work_dir / "runtime_config.json"
    cfg_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    execution.runtime_config = cfg
    execution.save(update_fields=["runtime_config"])
    return cfg_path


def _create_venv(work_dir: Path) -> Tuple[Path, str]:
    venv_dir = work_dir / ".venv"
    _safe_rmtree(venv_dir)
    base_python = _find_system_python()
    result = subprocess.run(
        [base_python, "-m", "venv", str(venv_dir)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"venv creation failed using: {base_python}\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
    python_bin = (
        venv_dir / "Scripts" / "python.exe"
        if os.name == "nt"
        else venv_dir / "bin" / "python"
    )
    return venv_dir, str(python_bin)


def _find_requirements_txt(etl_code_dir: Path) -> Path | None:
    direct = etl_code_dir / "requirements.txt"
    if direct.exists():
        return direct
    matches = list(etl_code_dir.rglob("requirements.txt"))
    if matches:
        matches.sort(key=lambda p: len(p.parts))
        return matches[0]
    return None


def _install_requirements(python_bin: str, etl_code_dir: Path) -> str:
    req = _find_requirements_txt(etl_code_dir)
    if not req:
        return "⚠️ No requirements.txt found — skipping package installation.\n"

    print(f"[INSTALL] Found requirements.txt at: {req}")

    try:
        req_content = req.read_text(encoding="utf-8")
        packages = [line.strip() for line in req_content.splitlines() if line.strip() and not line.startswith("#")]
        print(f"[INSTALL] Packages to install: {packages}")
    except Exception as e:
        print(f"[INSTALL] Could not read requirements.txt: {e}")

    cmd = [python_bin, "-m", "pip", "install", "-r", str(req), "--no-cache-dir", "-v"]
    print(f"[INSTALL] Running: {' '.join(cmd)}")

    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(req.parent))

    log = f"$ {' '.join(cmd)}\nSTDOUT:\n{r.stdout}\nSTDERR:\n{r.stderr}\nReturn code: {r.returncode}\n"

    if r.returncode != 0:
        print(f"[INSTALL] FAILED with return code {r.returncode}")
        raise RuntimeError(f"pip install FAILED (exit {r.returncode}):\nSTDOUT: {r.stdout}\nSTDERR: {r.stderr}")

    verify_cmd = [python_bin, "-c", "import pandas, toml, openpyxl; print('SUCCESS')"]
    verify = subprocess.run(verify_cmd, capture_output=True, text=True)

    if verify.returncode == 0 and "SUCCESS" in verify.stdout:
        log += "\n✅ Installation verified: pandas, toml, openpyxl all importable\n"
        print("[INSTALL] ✅ Installation verified successfully")
    else:
        log += f"\n⚠️ Verification failed: {verify.stderr}\n"
        print(f"[INSTALL] ⚠️ Verification failed: {verify.stderr}")

    return log


def _resolve_entry_point(etl_code_dir: Path, entry_point: str) -> Tuple[Path, Path]:
    matches = list(etl_code_dir.rglob(entry_point))
    if matches:
        matches.sort(key=lambda p: len(p.parts))
        entry = matches[0]
        return entry, entry.parent
    contents = [str(p.relative_to(etl_code_dir)) for p in etl_code_dir.rglob("*")][:40]
    raise FileNotFoundError(
        f"Entry point '{entry_point}' not found in ETL package.\n"
        f"Files present:\n  " + "\n  ".join(contents or ["(empty)"])
    )




def _run_script(
        python_bin: str, etl_code_dir: Path, entry_point: str, cfg_path: Path, work_dir: Path
) -> Tuple[int, str, str]:
    entry, entry_parent = _resolve_entry_point(etl_code_dir, entry_point)
    env = os.environ.copy()
    env["ETL_RUNTIME_CONFIG"] = str(cfg_path)

    cwd = work_dir

    print(f"[EXECUTE] Running: {python_bin} {entry}")
    print(f"[EXECUTE] CWD: {cwd}")

    r = subprocess.run(
        [python_bin, str(entry)],
        cwd=str(cwd), capture_output=True, text=True, env=env, timeout=3600
    )
    return r.returncode, r.stdout, r.stderr


def run_execution(execution: Execution) -> None:
    etl = execution.etl
    work_dir = _safe_work_dir(execution)
    _ensure_dir(work_dir)
    _ensure_dir(work_dir / "logs")

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

    try:
        print(f"\n{'=' * 80}")
        print(f"[EXECUTION] Starting execution {execution.id}")
        print(f"[EXECUTION] ETL: {etl.name}")
        print(f"[EXECUTION] Work dir: {work_dir}")
        print(f"{'=' * 80}\n")

        # ✅ Step 1: Copy ETL code
        execution.stdout_log += "[1/5] Copying ETL code...\n"
        execution.save(update_fields=["stdout_log"])

        etl_code_dir = _copy_etl_code(etl, work_dir)
        print(f"[EXECUTION] Copied ETL code to: {etl_code_dir}")

        # ✅ Step 2: Copy inputs
        execution.stdout_log += "[2/5] Processing input files...\n"
        execution.save(update_fields=["stdout_log"])

        input_paths = _copy_inputs(execution, work_dir)
        cfg_path = _write_runtime_config(execution, etl, work_dir, input_paths)

        # ✅ Step 3: Create venv
        execution.stdout_log += "[3/5] Creating virtual environment...\n"
        execution.save(update_fields=["stdout_log"])

        venv_dir, python_bin = _create_venv(work_dir)
        print(f"[EXECUTION] Created venv at: {venv_dir}")
        print(f"[EXECUTION] Python binary: {python_bin}")

        execution.venv_path = str(venv_dir)
        execution.save(update_fields=["venv_path"])

        # ✅ Step 4: Install dependencies
        execution.stdout_log += "[4/5] Installing dependencies...\n"
        execution.save(update_fields=["stdout_log"])

        deps_log = _install_requirements(python_bin, etl_code_dir)

        execution.dependencies_log = deps_log
        execution.dependencies_installed = True
        execution.status = "RUNNING"
        execution.stdout_log += deps_log
        execution.save(update_fields=[
            "dependencies_log", "dependencies_installed", "status", "stdout_log",
        ])

        # ✅ Step 5: Run ETL
        execution.stdout_log += "[5/5] Running ETL script...\n"
        execution.save(update_fields=["stdout_log"])

        rc, out, err = _run_script(python_bin, etl_code_dir, etl.entry_point, cfg_path, work_dir)
        execution.return_code = rc
        execution.stdout_log += out
        execution.stderr_log += err

        # ✅ Collect outputs - FIXED to prevent duplicates
        execution.stdout_log += "\nCollecting output files...\n"
        execution.save(update_fields=["stdout_log"])
        output_extensions = {".xlsx", ".xls", ".csv", ".pdf", ".zip"}
        registered_files = set()  # Track (name, size) to avoid duplicates

        def _register(child: Path) -> None:
            if not child.is_file():
                return
            if child.suffix.lower() not in output_extensions:
                return

            # ✅ Skip if already registered
            file_key = (child.name, child.stat().st_size)
            if file_key in registered_files:
                print(f"[OUTPUT] Skipped duplicate: {child.name}")
                return

            registered_files.add(file_key)
            # Prevent duplicate filenames for this execution
            if OutputFile.objects.filter(execution=execution, filename=child.name).exists():
                print(f"[OUTPUT] Skipped duplicate filename: {child.name}")
                return
            OutputFile.objects.create(
                execution=execution,
                filename=child.name,
                file_path=str(child),
                file_size=child.stat().st_size,
                file_type="excel" if child.suffix in {".xlsx", ".xls"} else "csv"
            )
            print(f"[OUTPUT] Registered: {child.name}")

        # ✅ ONLY scan direct children of these folders (not recursive)
        output_dirs = [
            work_dir / "outputs",
            work_dir / "deleted",
            work_dir / "archive"
        ]

        for output_dir in output_dirs:
            if output_dir.exists() and output_dir.is_dir():
                # ✅ Use iterdir() instead of rglob() to avoid recursion
                for child in output_dir.iterdir():
                    if child.is_file():  # Only process files, skip subdirectories
                        _register(child)

        execution.stdout_log += f"✓ Registered {len(registered_files)} unique output file(s)\n"
        print(f"[OUTPUT] Total registered: {len(registered_files)} unique files")
        execution.completed_at = timezone.now()
        execution.status = "SUCCESS" if rc == 0 else "FAILED"
        if rc != 0 and not execution.error_message:
            execution.error_message = "ETL process exited with non-zero status."
        execution.save(update_fields=[
            "completed_at", "status", "return_code",
            "stdout_log", "stderr_log", "error_message",
        ])

        print(f"\n[EXECUTION] Completed with status: {execution.status}")

    except Exception as exc:
        print(f"\n[EXECUTION] ERROR: {exc}")
        execution.completed_at = timezone.now()
        execution.status = "FAILED"
        execution.error_message = str(exc)
        execution.stderr_log += f"\n[ENGINE ERROR] {exc!r}"
        execution.save(update_fields=[
            "completed_at", "status", "error_message", "stderr_log",
        ])