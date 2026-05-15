"""
apps/common/path_utils.py
─────────────────────────
Path detection, resolution, and checking for both plain paths and folder-blocks.

Folder-block shape (from config):
  {
    "path": "data/folder/",
    "files number": 45,
    "check_mode": "count" | "files" | "both",   ← NEW: user-chosen check strategy
    "file1": "exact_name.xlsx",
    "file2": "parc*S*.xlsx",   ← wildcard  (contains, starts-with, ends-with, extension-only)
    "file3": "*test.txt",      ← wildcard
    "file4": "-"               ← placeholder / not set
  }

check_mode values:
  "count"  → only verify the total file count matches "files number"
  "files"  → only verify each fileN entry exists/matches (ignore count)
  "both"   → verify count AND each fileN  (default when both are present)
  "auto"   → system decides: if fileN entries exist use "files", else "count"

Rules:
  - path         → folder to check
  - files number → expected total count  (optional)
  - check_mode   → strategy (optional, default "auto")
  - fileN        → individual file/pattern to verify (optional)
  - "*" in name  → glob/wildcard match  (case-insensitive on all platforms)
  - "-"          → placeholder, show warning, do not block launch
"""
from __future__ import annotations

import fnmatch
import math
import os
from pathlib import Path
from typing import Any

from django.utils import timezone as tz


# ─────────────────────────────────────────────────────────────
# Config field type inference  (NEW)
# ─────────────────────────────────────────────────────────────

DATE_KEYWORDS   = {"date", "from", "to", "start", "end", "period", "month", "year", "day", "since", "until"}
NUMBER_KEYWORDS = {"count", "number", "nb", "max", "min", "limit", "size", "threshold", "timeout", "port"}
BOOL_VALUES     = {"true", "false", "yes", "no", "1", "0", "on", "off"}

import re as _re
_ISO_DATE_RE = _re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?")
_NUM_RE      = _re.compile(r"^-?\d+(\.\d+)?$")


def infer_field_type(key: str, value: Any) -> str:
    """
    Infer the UI widget type for a config field.

    Returns one of:
      "folder_block"  – structured folder dict
      "path"          – file/directory path string
      "date"          – ISO date / partial date
      "number"        – numeric value
      "boolean"       – true/false toggle
      "text"          – plain string (default)
    """
    if is_folder_block(value):
        return "folder_block"

    if not isinstance(value, (str, int, float, bool)):
        return "text"

    # Boolean check first (before number, since "1"/"0" are also bool-ish)
    if isinstance(value, bool):
        return "boolean"
    if str(value).lower() in BOOL_VALUES:
        return "boolean"

    # Check key name for strong signals
    key_lower = key.lower().replace("_", "").replace("-", "")

    for kw in DATE_KEYWORDS:
        if kw in key_lower:
            # Confirm value looks date-like or is empty
            if not value or _ISO_DATE_RE.match(str(value)):
                return "date"
            # Key says "date" but value is a path → fall through
            if not looks_like_path(str(value)):
                return "date"

    # Path detection
    if looks_like_path(str(value)):
        return "path"

    # Number by value
    if _NUM_RE.match(str(value)):
        return "number"

    # Number by key name
    for kw in NUMBER_KEYWORDS:
        if kw in key_lower:
            return "number"

    return "text"


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
    return str(block.get("path", "")).strip()


def _fb_count(block: dict) -> int | None:
    raw = block.get("files number")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _fb_check_mode(block: dict) -> str:
    """
    Return the check strategy for this folder block.

    Explicit value wins. Otherwise:
      - has fileN entries AND has files number  → "both"
      - has fileN entries only                  → "files"
      - has files number only                   → "count"
      - neither                                 → "count" (just verify folder accessible)
    """
    explicit = str(block.get("check_mode", "")).strip().lower()
    if explicit in ("count", "files", "both", "auto"):
        if explicit != "auto":
            return explicit

    has_count   = _fb_count(block) is not None
    has_entries = len(_fb_file_entries(block)) > 0

    if has_count and has_entries:
        return "both"
    if has_entries:
        return "files"
    return "count"


def _fb_file_entries(block: dict) -> list[tuple[str, str]]:
    """
    Return [(key, pattern), ...] for every 'fileN' key.
    Excludes 'files number' and 'check_mode' meta-keys.
    """
    META_KEYS = {"files number", "check_mode", "path"}
    return [
        (k, str(v).strip())
        for k, v in block.items()
        if k.lower().startswith("file")
        and k.lower() not in META_KEYS
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
    # Explicit path starters
    if v.startswith(("/", "./", "../")):
        return True
    # Windows absolute  C:/ or C:\
    if len(v) > 2 and v[1] == ":" and v[2] in ("/", "\\"):
        return True
    # Contains separator AND either has a file extension or ends with separator
    if ("/" in v or "\\" in v) and (
        "." in v.split("/")[-1].split("\\")[-1]
        or v.endswith(("/", "\\"))
    ):
        return True
    # Simple folder-like names without separators (e.g. "outputs", "logs", "deleted")
    # These are relative folder references — include them so users can classify them
    if v and not v.startswith("{") and "/" not in v and "\\" not in v:
        # Only flag as path if value looks like a folder/file name (no spaces, not a number)
        if _NUM_RE.match(v):
            return False
        if v.lower() in BOOL_VALUES:
            return False
        if " " not in v and len(v) <= 60:
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


def get_annotated_config_fields(config: dict) -> dict[str, dict]:
    """
    Return enriched field metadata for every config key.

    Shape per key:
    {
        "type":           "folder_block" | "path" | "date" | "number" | "boolean" | "text",
        "is_path_like":   bool,
        "display_value":  str,       # human-friendly string representation
        "is_placeholder": bool,      # value is "-", "—", "", "?"
    }
    """
    result = {}
    for k, v in config.items():
        field_type    = infer_field_type(k, v)
        is_path_like  = field_type in ("folder_block", "path")
        raw_str       = str(v) if not isinstance(v, dict) else _fb_path(v) if is_folder_block(v) else str(v)
        is_placeholder = raw_str.strip() in ("-", "—", "", "?", "null", "none")
        result[k] = {
            "type":           field_type,
            "is_path_like":   is_path_like,
            "display_value":  raw_str,
            "is_placeholder": is_placeholder,
        }
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
    if work_dir:
        c = (Path(work_dir) / "etl_code" / raw).resolve()
        if c.exists():
            return c
    if base_dir:
        c = (Path(base_dir) / raw).resolve()
        if c.exists():
            return c
    if work_dir:
        c = (Path(work_dir) / raw).resolve()
        if c.exists():
            return c
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

_TABULAR    = {".csv", ".xlsx", ".xls", ".tsv", ".parquet"}
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
    pf  = pq.read_table(path)
    schema = pf.schema
    df  = pf.to_pandas().head(5)
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
# Directory helpers
# ─────────────────────────────────────────────────────────────

def _fnmatch_ci(name: str, pattern: str) -> bool:
    """Case-insensitive fnmatch — fixes Windows filesystem mismatches."""
    return fnmatch.fnmatch(name.lower(), pattern.lower())


def _glob_in_dir(folder: Path, pattern: str) -> list[str]:
    """
    Find files in folder matching pattern.
    Handles:
      - "*.xlsx"       → all xlsx files
      - "report*"      → starts with "report"
      - "*S*"          → contains "S"  (case-insensitive)
      - ".xlsx"        → extension-only match (no leading *)
      - "file.xlsx"    → exact match (no wildcard, handled separately but safe here too)
    Always case-insensitive.
    """
    # Extension-only shorthand: ".xlsx" → treat as "*.xlsx"
    if pattern.startswith(".") and "*" not in pattern:
        pattern = f"*{pattern}"

    try:
        return [
            f.name for f in folder.iterdir()
            if f.is_file() and _fnmatch_ci(f.name, pattern)
        ]
    except PermissionError:
        return []
    except Exception:
        return []


def _exact_in_dir(folder: Path, filename: str) -> bool:
    """
    Case-insensitive exact file lookup.
    Handles OneDrive / NTFS paths where Python's is_file() can be case-sensitive
    depending on the OS.
    """
    target = filename.lower()
    try:
        return any(
            f.name.lower() == target
            for f in folder.iterdir()
            if f.is_file()
        )
    except PermissionError:
        return False
    except Exception:
        return False


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


def _folder_sample(folder: Path, limit: int = 10) -> list[str]:
    """
    Return up to `limit` filenames from a folder for display in the UI.
    Helps users spot typos in file patterns immediately.
    """
    try:
        files = sorted(f.name for f in folder.iterdir() if f.is_file())
        return files[:limit]
    except Exception:
        return []


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
        "field_type":     infer_field_type(config_key, raw_val),
    }

    if raw_str in ("-", "—", "", "?", "null", "none"):
        entry["is_placeholder"] = True
        entry["warnings"] = [f"'{config_key}' is not configured (value is '{raw_str}'). Fill it in if required."]
        entry["issue"] = "Not configured — placeholder value."
        return entry

    resolved = resolve_path(raw_str, extracted_path, work_dir)
    entry["path"] = str(resolved)
    entry["path_type"] = "absolute" if Path(raw_str).is_absolute() else "relative_to_zip"

    # ── Output paths: create directory if it doesn't exist ───────────
    # Output folders may not exist yet — that's expected.
    # We create the parent so the ETL doesn't fail with FileNotFoundError.
    if classification == "output":
        entry["accessible"] = True
        if resolved.exists():
            entry.update(_file_meta(resolved))
        else:
            # Try to create the output directory automatically
            try:
                resolved.mkdir(parents=True, exist_ok=True)
                entry["auto_created"] = True
                entry["is_file"] = False
                entry["is_dir"] = True
                entry["files_in_dir"] = 0
            except Exception as exc:
                entry["auto_created"] = False
                entry["warnings"] = [f"Output directory could not be pre-created: {exc}"]
                entry["is_file"] = False
                entry["is_dir"] = False
        return entry

    # ── Input paths: must exist ───────────────────────────────────────
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
    folder_raw      = _fb_path(block)
    expected_count  = _fb_count(block)
    file_entries    = _fb_file_entries(block)
    check_mode      = _fb_check_mode(block)

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
        "check_mode":        check_mode,
        "file_checks":       [],
        "file_count_check":  None,
        "folder_sample":     [],       # NEW: first N filenames for user feedback
        "warnings":          warnings,
    }

    if not folder_raw:
        entry["issue"] = "No folder path set."
        return entry

    resolved = resolve_path(folder_raw, extracted_path, work_dir)
    entry["path"] = str(resolved)

    folder_ok = resolved.exists() and resolved.is_dir()
    entry["folder_accessible"] = folder_ok

    # ── Output folder: create it if needed ───────────────────────────
    if classification == "output":
        entry["accessible"] = True
        if not folder_ok:
            try:
                resolved.mkdir(parents=True, exist_ok=True)
                folder_ok = True
                entry["folder_accessible"] = True
                entry["auto_created"] = True
            except Exception as exc:
                entry["warnings"] = [f"Could not create output folder: {exc}"]
        if folder_ok:
            entry.update(_file_meta(resolved))
            entry["found_files"] = _list_files(resolved)
        return entry

    # ── Input folder: must exist ──────────────────────────────────────
    if not folder_ok:
        entry["issue"] = f"Folder not found: {resolved}"
        # Still process entries to surface placeholder warnings
        _run_file_checks_offline(file_entries, warnings, entry)
        if not folder_ok:
            entry["issue"] = f"Folder not found: {resolved}"
            # Also mark count check as failed if one was expected
            if expected_count is not None:
                entry["file_count_check"] = {
                    "declared": expected_count,
                    "actual": 0,
                    "ok": False,
                }
                warnings.append(f"Cannot verify file count — folder not accessible.")
            _run_file_checks_offline(file_entries, warnings, entry)
            return entry

    entry["accessible"] = True
    entry.update(_file_meta(resolved))

    # Always show a sample of actual files in the folder — helps users spot
    # typos in patterns immediately without having to open a file explorer.
    entry["folder_sample"] = _folder_sample(resolved, limit=10)

    # ── File count check ──────────────────────────────────────────────
    if check_mode in ("count", "both") and expected_count is not None:
        actual    = _count_files(resolved)
        count_ok  = actual >= expected_count
        entry["file_count_check"] = {
            "declared": expected_count,
            "actual":   actual,
            "ok":       count_ok,
        }
        if not count_ok:
            warnings.append(
                f"Expected at least {expected_count} file(s), found {actual}."
            )

    # ── Per-file checks ───────────────────────────────────────────────
    if check_mode in ("files", "both"):
        file_checks: list[dict] = []

        for key, pattern in file_entries:
            fc: dict = {
                "key":            key,
                "pattern":        pattern,
                "is_placeholder": pattern in ("-", "—", "", "?"),
                "is_wildcard":    "*" in pattern or (pattern.startswith(".") and len(pattern) > 1),
                "matched_files":  [],
                "ok":             False,
                "warning":        None,
            }

            if fc["is_placeholder"]:
                fc["warning"] = (
                    f"'{key}' is not configured (value is '{pattern}'). "
                    "Fill it in or leave as-is — won't block launch."
                )
                warnings.append(fc["warning"])
                file_checks.append(fc)
                continue

            if fc["is_wildcard"]:
                # Extension-only: ".xlsx" → expand to "*.xlsx"
                effective_pattern = (
                    f"*{pattern}" if pattern.startswith(".") and "*" not in pattern
                    else pattern
                )
                matched = _glob_in_dir(resolved, effective_pattern)
                fc["matched_files"] = matched
                fc["ok"]            = len(matched) > 0
                fc["pattern"]       = effective_pattern  # show expanded pattern
                if not fc["ok"]:
                    fc["warning"] = f"No files matched '{effective_pattern}' in folder."
                    warnings.append(fc["warning"])
                else:
                    # Preview first matched file if tabular
                    first = resolved / matched[0]
                    preview = dataframe_preview(first)
                    if preview:
                        fc["dataframe_preview"] = preview
            else:
                # Exact match — case-insensitive
                found = _exact_in_dir(resolved, pattern)
                fc["ok"] = found
                if found:
                    fc["matched_files"] = [pattern]
                    preview = dataframe_preview(resolved / pattern)
                    if preview:
                        fc["dataframe_preview"] = preview
                else:
                    fc["warning"] = (
                        f"File '{pattern}' not found in folder. "
                        f"Folder contains: {', '.join(entry['folder_sample'][:5]) or '(empty)'}."
                    )
                    warnings.append(fc["warning"])

            file_checks.append(fc)

        entry["file_checks"] = file_checks

    entry["accessible"] = folder_ok
    return entry


def _run_file_checks_offline(
    file_entries: list[tuple[str, str]],
    warnings: list[str],
    entry: dict,
) -> None:
    """Populate file_checks when the folder is not accessible (surface placeholders)."""
    file_checks = []
    for key, pattern in file_entries:
        fc = {
            "key":            key,
            "pattern":        pattern,
            "is_placeholder": pattern in ("-", "—", "", "?"),
            "is_wildcard":    "*" in pattern,
            "matched_files":  [],
            "ok":             False,
            "warning":        "Cannot check — folder not accessible.",
        }
        if fc["is_placeholder"]:
            fc["warning"] = f"'{key}' is not configured."
            warnings.append(fc["warning"])
        file_checks.append(fc)
    entry["file_checks"] = file_checks