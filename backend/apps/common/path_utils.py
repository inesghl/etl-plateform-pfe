"""
apps/common/path_utils.py
─────────────────────────
Path detection, resolution, and checking for both plain paths and folder-blocks.

Folder-block shape (from config):
  {
    "path": "data/folder/",
    "files number": 45,
    "file1": "exact_name.xlsx",
    "file2": "parc*S*.xlsx",   ← wildcard
    "file3": "*test.txt",      ← wildcard
    "file4": "-"               ← placeholder / not set
  }

Rules:
  - path         → folder to check
  - files number → expected total count  (optional)
  - fileN        → individual file/pattern to verify (optional)
  - "*" in name  → glob/wildcard match
  - "-"          → placeholder, show warning, do not block launch
"""
from __future__ import annotations

import fnmatch
import math
from pathlib import Path
from typing import Any

from django.utils import timezone as tz


# ─────────────────────────────────────────────────────────────
# Folder-block detection helpers
# ─────────────────────────────────────────────────────────────

def is_folder_block(value: Any) -> bool:
    """True when the config value is a dict describing a folder."""
    return (
        isinstance(value, dict)
        and not isinstance(value, list)
        and (
            "path" in value
            or any(k.lower().startswith("file") for k in value)
        )
    )


def _fb_path(block: dict) -> str:
    """Return the folder path string from a folder-block."""
    return str(block.get("path", "")).strip()


def _fb_count(block: dict) -> int | None:
    """Return declared file count, or None."""
    raw = block.get("files number")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _fb_file_entries(block: dict) -> list[tuple[str, str]]:
    """
    Return [(key, pattern), ...] for every 'fileN' key in the block,
    in the order they appear.
    """
    return [
        (k, str(v).strip())
        for k, v in block.items()
        if k.lower().startswith("file")
        and k.lower() not in ("files number",)
    ]


# ─────────────────────────────────────────────────────────────
# Path-like key detection
# ─────────────────────────────────────────────────────────────

def looks_like_path(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    v = value.strip()
    if not v:
        return False
    if v.startswith(("/", "./", "../")):
        return True
    if len(v) > 2 and v[1] == ":" and v[2] in ("/", "\\"):
        return True  # Windows C:/...
    if ("/" in v or "\\" in v) and (
        "." in v.split("/")[-1] or v.endswith(("/", "\\"))
    ):
        return True
    return False


def get_path_like_keys(config: dict) -> dict[str, str]:
    """
    Walk config and return { key: display_string } for every path-like value.
    Folder-blocks are surfaced by their top-level key with display = folder path.
    """
    result: dict[str, str] = {}
    for k, v in config.items():
        if is_folder_block(v):
            result[k] = _fb_path(v) or "<folder block>"
        elif looks_like_path(v):
            result[k] = str(v)
    return result


def resolve_config_key(config: dict, key: str) -> Any:
    """Resolve a simple or dot-notation key from a nested dict."""
    if key in config:
        return config[key]
    parts = key.split(".")
    cur: Any = config
    for p in parts:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(p)
        if cur is None:
            return None
    return cur


# ─────────────────────────────────────────────────────────────
# Path resolution
# ─────────────────────────────────────────────────────────────

def resolve_path(raw: str, base_dir: str = "", work_dir: str = "") -> Path:
    """
    Resolve raw to an absolute Path.
    Tries: absolute → work_dir/etl_code/ → base_dir/ → work_dir/
    Always returns a Path (may not exist).
    """
    if not raw:
        return Path(raw)
    p = Path(raw)
    if p.is_absolute():
        return p
    # 1. Runtime location
    if work_dir:
        c = (Path(work_dir) / "etl_code" / raw).resolve()
        if c.exists():
            return c
    # 2. Original ZIP location
    if base_dir:
        c = (Path(base_dir) / raw).resolve()
        if c.exists():
            return c
    # 3. work_dir root
    if work_dir:
        c = (Path(work_dir) / raw).resolve()
        if c.exists():
            return c
    # Best-guess (may not exist)
    if work_dir:
        return (Path(work_dir) / "etl_code" / raw).resolve()
    if base_dir:
        return (Path(base_dir) / raw).resolve()
    return p


# ─────────────────────────────────────────────────────────────
# File metadata helpers
# ─────────────────────────────────────────────────────────────

def _fmt_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n //= 1024
    return f"{n:.1f} TB"


def _file_meta(p: Path) -> dict:
    try:
        st = p.stat()
        meta: dict = {
            "size_bytes":    st.st_size,
            "size_display":  _fmt_size(st.st_size),
            "last_modified": tz.datetime.fromtimestamp(st.st_mtime, tz=tz.utc).isoformat(),
            "extension":     p.suffix.lower() if p.is_file() else "",
            "is_file":       p.is_file(),
            "is_dir":        p.is_dir(),
        }
        if p.is_dir():
            try:
                files = [c for c in p.iterdir() if c.is_file()]
                meta["files_in_dir"] = len(files)
            except PermissionError:
                meta["files_in_dir"] = None
        return meta
    except Exception as exc:
        return {"error": str(exc)}


# ─────────────────────────────────────────────────────────────
# Dataframe preview
# ─────────────────────────────────────────────────────────────

_TABULAR = {".csv", ".xlsx", ".xls", ".tsv", ".parquet"}
_MAX_PREVIEW = 200 * 1024 * 1024


def dataframe_preview(path: Path) -> dict | None:
    if path.suffix.lower() not in _TABULAR:
        return None
    try:
        if path.stat().st_size > _MAX_PREVIEW:
            return {"skipped": True, "reason": "File too large for preview (> 200 MB)"}
    except Exception:
        return None
    try:
        return (
            _parquet_preview(path)
            if path.suffix.lower() == ".parquet"
            else _tabular_preview(path)
        )
    except Exception as exc:
        return {"error": str(exc)}


def _tabular_preview(path: Path) -> dict:
    try:
        import pandas as pd
    except ImportError:
        return {"error": "pandas not installed"}
    ext = path.suffix.lower()
    if ext == ".csv":
        df = pd.read_csv(path, low_memory=False)
    elif ext == ".tsv":
        df = pd.read_csv(path, sep="\t", low_memory=False)
    elif ext in (".xlsx", ".xls"):
        df = pd.read_excel(path)
    else:
        return {"error": f"Unsupported: {ext}"}
    col_stats: dict = {}
    for col in df.columns:
        s = df[col]
        stat: dict = {
            "dtype":      str(s.dtype),
            "null_count": int(s.isna().sum()),
            "null_pct":   round(float(s.isna().mean()) * 100, 1),
        }
        if pd.api.types.is_numeric_dtype(s):
            d = s.describe()
            stat.update({k: _sf(d.get(k)) for k in ("min", "max", "mean", "std")})
        else:
            u = s.dropna().unique()
            stat["unique_count"] = int(len(u))
            if len(u) <= 12:
                stat["unique_values"] = [str(x) for x in u[:12]]
        col_stats[col] = stat
    sample = df.head(5).fillna("")
    return {
        "columns":     list(df.columns),
        "dtypes":      {c: str(df[c].dtype) for c in df.columns},
        "row_count":   len(df),
        "col_count":   len(df.columns),
        "col_stats":   col_stats,
        "sample_rows": [
            [str(row.get(c, "")) for c in df.columns]
            for row in sample.to_dict(orient="records")
        ],
    }


def _parquet_preview(path: Path) -> dict:
    try:
        import pyarrow.parquet as pq
    except ImportError:
        return {"error": "pyarrow not installed"}
    pf = pq.read_table(path)
    schema = pf.schema
    df = pf.to_pandas().head(5)
    return {
        "columns":     schema.names,
        "dtypes":      {n: str(schema.field(n).type) for n in schema.names},
        "row_count":   pf.num_rows,
        "col_count":   len(schema.names),
        "col_stats":   {},
        "sample_rows": [
            [str(row.get(c, "")) for c in schema.names]
            for row in df.fillna("").to_dict(orient="records")
        ],
    }


def _sf(val) -> float | None:
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────
# check_one_path — main entry point
# ─────────────────────────────────────────────────────────────

def check_one_path(
    config_key: str,
    classification: str,
    effective_config: dict,
    extracted_path: str,
    work_dir: str = "",
) -> dict:
    """
    Resolve and check one config key.
    Dispatches to folder-block or plain-path checker.
    """
    raw_val = resolve_config_key(effective_config, config_key)

    if raw_val is None:
        return {
            "config_key":     config_key,
            "classification": classification,
            "path":           None,
            "raw_path":       None,
            "accessible":     False,
            "issue":          f"Key '{config_key}' not found in config.",
        }

    if is_folder_block(raw_val):
        return _check_folder_block(config_key, classification, raw_val, extracted_path, work_dir)

    return _check_plain(config_key, classification, raw_val, extracted_path, work_dir)


# ── Plain string path ─────────────────────────────────────────

def _check_plain(
    config_key: str,
    classification: str,
    raw_val: Any,
    extracted_path: str,
    work_dir: str,
) -> dict:
    raw_str = str(raw_val).strip()

    entry: dict = {
        "config_key":     config_key,
        "classification": classification,
        "raw_path":       raw_str,
        "path":           None,
        "accessible":     False,
        "is_placeholder": False,
    }

    # Placeholder
    if raw_str in ("-", "—", "", "?", "null", "none"):
        entry["is_placeholder"] = True
        entry["warnings"] = [f"'{config_key}' is not configured (value is '{raw_str}'). Fill it in if required."]
        entry["issue"] = "Not configured — placeholder value."
        return entry

    resolved = resolve_path(raw_str, extracted_path, work_dir)
    entry["path"] = str(resolved)
    entry["path_type"] = "absolute" if Path(raw_str).is_absolute() else "relative_to_zip"

    # Output paths don't need to exist yet
    if classification == "output":
        entry["accessible"] = True
        entry.update(_file_meta(resolved) if resolved.exists() else {"is_file": False, "is_dir": False})
        return entry

    if resolved.exists():
        entry["accessible"] = True
        entry.update(_file_meta(resolved))
        if resolved.is_file():
            preview = dataframe_preview(resolved)
            if preview is not None:
                entry["dataframe_preview"] = preview
    else:
        entry["issue"] = f"Not found: {resolved}"

    return entry


# ── Folder-block path ─────────────────────────────────────────

def _check_folder_block(
    config_key: str,
    classification: str,
    block: dict,
    extracted_path: str,
    work_dir: str,
) -> dict:
    folder_raw = _fb_path(block)
    expected_count = _fb_count(block)
    file_entries = _fb_file_entries(block)

    warnings: list[str] = []

    entry: dict = {
        "config_key":        config_key,
        "classification":    classification,
        "raw_path":          folder_raw,
        "path":              None,
        "accessible":        False,
        "is_dir":            True,
        "is_file":           False,
        "folder_accessible": False,
        "file_checks":       [],
        "file_count_check":  None,
        "warnings":          warnings,
    }

    if not folder_raw:
        entry["issue"] = "No folder path set."
        return entry

    resolved = resolve_path(folder_raw, extracted_path, work_dir)
    entry["path"] = str(resolved)

    folder_ok = resolved.exists() and resolved.is_dir()
    entry["folder_accessible"] = folder_ok

    # Output folders don't need to exist yet
    if classification == "output":
        entry["accessible"] = True
        if folder_ok:
            entry.update(_file_meta(resolved))
            # For output folder blocks, list files found after execution
            entry["found_files"] = _list_files(resolved)
        return entry

    # Input folder must exist
    if not folder_ok:
        entry["issue"] = f"Folder not found: {resolved}"
        # Still run file checks to surface placeholders
    else:
        entry["accessible"] = True
        entry.update(_file_meta(resolved))

    # ── File count ────────────────────────────────────────────
    if expected_count is not None:
        actual = _count_files(resolved) if folder_ok else 0
        count_ok = actual >= expected_count
        entry["file_count_check"] = {
            "declared": expected_count,
            "actual":   actual,
            "ok":       count_ok,
        }
        if not count_ok:
            warnings.append(f"Expected {expected_count} file(s), found {actual}.")

    # ── Per-file checks ───────────────────────────────────────
    file_checks: list[dict] = []
    for key, pattern in file_entries:
        fc: dict = {
            "key":            key,
            "pattern":        pattern,
            "is_placeholder": pattern in ("-", "—", "", "?"),
            "is_wildcard":    "*" in pattern,
            "matched_files":  [],
            "ok":             False,
            "warning":        None,
        }

        if fc["is_placeholder"]:
            fc["warning"] = f"'{key}' is not configured (value is '-'). Fill it in if this file is required."
            warnings.append(fc["warning"])
            file_checks.append(fc)
            continue

        if not folder_ok:
            fc["warning"] = "Cannot check — folder not accessible."
            file_checks.append(fc)
            continue

        if fc["is_wildcard"]:
            matched = _glob_in_dir(resolved, pattern)
            fc["matched_files"] = matched
            fc["ok"] = len(matched) > 0
            if not fc["ok"]:
                fc["warning"] = f"No files matched '{pattern}' in folder."
                warnings.append(fc["warning"])
        else:
            exact = resolved / pattern
            fc["ok"] = exact.is_file()
            if fc["ok"]:
                fc["matched_files"] = [pattern]
                # Preview for exact input files
                preview = dataframe_preview(exact)
                if preview is not None:
                    fc["dataframe_preview"] = preview
            else:
                fc["warning"] = f"File '{pattern}' not found."
                warnings.append(fc["warning"])

        file_checks.append(fc)

    entry["file_checks"] = file_checks

    # Overall: folder accessible; file warnings don't block (just warn)
    if classification == "input":
        entry["accessible"] = folder_ok

    return entry


# ─────────────────────────────────────────────────────────────
# Directory helpers
# ─────────────────────────────────────────────────────────────

def _glob_in_dir(folder: Path, pattern: str) -> list[str]:
    try:
        return [f.name for f in folder.iterdir() if f.is_file() and fnmatch.fnmatch(f.name, pattern)]
    except PermissionError:
        return []


def _count_files(folder: Path) -> int:
    try:
        return sum(1 for f in folder.iterdir() if f.is_file())
    except PermissionError:
        return 0


def _list_files(folder: Path) -> list[dict]:
    """List files in a folder for output surfacing after execution."""
    try:
        result = []
        for f in sorted(folder.iterdir()):
            if f.is_file():
                st = f.stat()
                result.append({
                    "name":         f.name,
                    "size_display": _fmt_size(st.st_size),
                    "extension":    f.suffix.lower(),
                })
        return result
    except Exception:
        return []