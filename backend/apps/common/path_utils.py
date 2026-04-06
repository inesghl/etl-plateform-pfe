"""
apps/common/path_utils.py
──────────────────────────
Shared path-detection, resolution, file-metadata, and dataframe-preview
helpers used by both ETLViewSet and ExecutionViewSet.
"""

from __future__ import annotations

import math
from pathlib import Path

from django.utils import timezone as tz


# ── Path detection ────────────────────────────────────────────────

def looks_like_path(value) -> bool:
    if not isinstance(value, str):
        return False
    v = value.strip()
    if not v:
        return False
    if v.startswith("/") or v.startswith("./") or v.startswith("../"):
        return True
    if len(v) > 2 and v[1] == ":" and v[2] in ("/", "\\"):
        return True  # Windows absolute e.g. C:/...
    if ("/" in v or "\\" in v) and (
        "." in v.split("/")[-1] or v.endswith("/") or v.endswith("\\")
    ):
        return True
    return False


def get_path_like_keys(config: dict) -> dict:
    """
    Recursively walk a config dict and return all keys whose values look like
    filesystem paths, using dot-notation (list indices as [n]).

    Returns: { "section.key": "/the/path/value", ... }
    """
    result: dict = {}

    def _walk(d, prefix=""):
        if not isinstance(d, dict):
            return
        for k, v in d.items():
            full_key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                _walk(v, full_key)
            elif isinstance(v, list):
                for i, item in enumerate(v):
                    if isinstance(item, str) and looks_like_path(item):
                        result[f"{full_key}[{i}]"] = item
                    elif isinstance(item, dict):
                        _walk(item, f"{full_key}[{i}]")
            elif looks_like_path(v):
                result[full_key] = v

    _walk(config)
    return result


def resolve_config_key(config: dict, key: str):
    """
    Resolve a dot-notated key (optionally with [n] bracket notation) from a
    nested dict. Returns None if any segment is missing.
    """
    parts = key.replace("]", "").replace("[", ".").split(".")
    val = config
    for part in parts:
        if not part:
            continue
        if isinstance(val, list):
            try:
                val = val[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(val, dict):
            val = val.get(part)
            if val is None:
                return None
        else:
            return None
    return val


def resolve_path(raw_value: str, base_dir: str = "") -> Path:
    """
    Absolute  → use as-is.
    Relative  → resolve against base_dir if provided.
    """
    p = Path(raw_value)
    if p.is_absolute():
        return p
    if base_dir:
        return (Path(base_dir) / p).resolve()
    return p


# ── File metadata ─────────────────────────────────────────────────

def format_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 ** 2:
        return f"{n / 1024:.1f} KB"
    if n < 1024 ** 3:
        return f"{n / 1024 ** 2:.1f} MB"
    return f"{n / 1024 ** 3:.1f} GB"


def file_metadata(path: Path) -> dict:
    try:
        st = path.stat()
        meta: dict = {
            "size_bytes": st.st_size,
            "size_display": format_size(st.st_size),
            "last_modified": tz.datetime.fromtimestamp(st.st_mtime, tz=tz.utc).isoformat(),
            "extension": path.suffix.lower() if path.is_file() else "",
            "is_file": path.is_file(),
            "is_dir": path.is_dir(),
        }
        if path.is_dir():
            try:
                children = list(path.iterdir())
                files = [c for c in children if c.is_file()]
                meta["files_in_dir"] = len(files)
                meta["size_bytes"] = sum(c.stat().st_size for c in files)
                meta["size_display"] = format_size(meta["size_bytes"])
            except Exception:
                pass
        return meta
    except Exception as e:
        return {"error": str(e)}


# ── Dataframe preview ─────────────────────────────────────────────

TABULAR_EXTENSIONS = {".csv", ".xlsx", ".xls", ".tsv", ".parquet"}
MAX_PREVIEW_BYTES = 200 * 1024 * 1024  # 200 MB
SAMPLE_ROWS = 5


def dataframe_preview(path: Path) -> dict | None:
    """
    Return a rich preview dict for tabular files (CSV, Excel, Parquet, TSV).
    Returns None for non-tabular files.
    """
    if path.suffix.lower() not in TABULAR_EXTENSIONS:
        return None

    try:
        size = path.stat().st_size
    except Exception:
        return None

    if size > MAX_PREVIEW_BYTES:
        return {
            "skipped": True,
            "reason": f"File too large for preview ({format_size(size)} > 200 MB)",
        }

    try:
        ext = path.suffix.lower()
        if ext == ".parquet":
            return _parquet_preview(path)
        return _tabular_preview(path, ext)
    except Exception as e:
        return {"error": str(e)}


def _tabular_preview(path: Path, ext: str) -> dict:
    try:
        import pandas as pd
    except ImportError:
        return {"error": "pandas not installed"}

    if ext == ".csv":
        df = pd.read_csv(path, low_memory=False)
    elif ext == ".tsv":
        df = pd.read_csv(path, sep="\t", low_memory=False)
    elif ext in (".xlsx", ".xls"):
        df = pd.read_excel(path)
    else:
        return {"error": f"Unsupported extension: {ext}"}

    col_stats: dict = {}
    for col in df.columns:
        s = df[col]
        stat: dict = {
            "dtype": str(s.dtype),
            "null_count": int(s.isna().sum()),
            "null_pct": round(float(s.isna().mean()) * 100, 1),
        }
        if pd.api.types.is_numeric_dtype(s):
            desc = s.describe()
            stat.update({
                "min":  _safe_float(desc.get("min")),
                "max":  _safe_float(desc.get("max")),
                "mean": _safe_float(desc.get("mean")),
                "std":  _safe_float(desc.get("std")),
            })
        else:
            unique = s.dropna().unique()
            stat["unique_count"] = int(len(unique))
            if len(unique) <= 12:
                stat["unique_values"] = [str(v) for v in unique[:12]]
        col_stats[col] = stat

    sample = df.head(SAMPLE_ROWS).fillna("")
    return {
        "columns":     list(df.columns),
        "dtypes":      {col: str(df[col].dtype) for col in df.columns},
        "row_count":   len(df),
        "col_count":   len(df.columns),
        "col_stats":   col_stats,
        "sample_rows": [
            [str(row.get(col, "")) for col in df.columns]
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
    df = pf.to_pandas().head(SAMPLE_ROWS)

    return {
        "columns":     schema.names,
        "dtypes":      {n: str(schema.field(n).type) for n in schema.names},
        "row_count":   pf.num_rows,
        "col_count":   len(schema.names),
        "col_stats":   {},
        "sample_rows": [
            [str(row.get(col, "")) for col in schema.names]
            for row in df.fillna("").to_dict(orient="records")
        ],
    }


def _safe_float(val) -> float | None:
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 4)
    except Exception:
        return None


# ── Single-path check (used in both viewsets) ─────────────────────

def check_one_path(
    config_key: str,
    classification: str,
    effective_config: dict,
    extracted_path: str,
    include_preview: bool = True,
    work_dir: str = "",
) -> dict:
    """
    Resolve + stat one config key.

    Resolution order for relative paths:
      1. work_dir/etl_code/<relative>  — where the ETL actually runs (post-launch)
      2. extracted_path/<relative>     — original ZIP extraction (pre-launch check)

    Absolute paths are used directly.
    """
    raw_val = resolve_config_key(effective_config, config_key)

    if raw_val is None:
        return {
            "config_key": config_key,
            "path": None,
            "raw_path": None,
            "accessible": False,
            "classification": classification,
            "issue": f"Key '{config_key}' not found in config",
        }

    raw_str = str(raw_val)
    p = Path(raw_str)

    # ── Resolve the path ──────────────────────────────────────────
    if p.is_absolute():
        resolved = p
    else:
        # For relative paths: prefer the work_dir copy (runtime reality),
        # fall back to extracted_path (pre-launch check).
        resolved = None
        if work_dir:
            candidate = (Path(work_dir) / "etl_code" / p).resolve()
            if candidate.exists():
                resolved = candidate
        if resolved is None:
            resolved = resolve_path(raw_str, extracted_path) if extracted_path else p

    accessible = resolved.exists()

    entry: dict = {
        "config_key": config_key,
        "path": str(resolved),
        "raw_path": raw_str,
        "accessible": accessible,
        "classification": classification,
        "path_type": "absolute" if p.is_absolute() else "relative_to_zip",
    }

    if accessible:
        entry.update(file_metadata(resolved))
        if include_preview and classification == "input" and resolved.is_file():
            preview = dataframe_preview(resolved)
            if preview is not None:
                entry["dataframe_preview"] = preview
    else:
        if p.is_absolute():
            entry["issue"] = f"Not found on server filesystem: {resolved}"
        else:
            searched = []
            if work_dir:
                searched.append(f"work_dir/etl_code/{raw_str}")
            if extracted_path:
                searched.append(f"extracted/{raw_str}")
            entry["issue"] = (
                f"Relative path '{raw_str}' not found"
                + (f" (searched: {', '.join(searched)})" if searched else "")
            )

    return entry