"""
etl/loader.py
──────────────
Loads the runtime configuration written by the platform (runtime_config.json)
and reads the input Excel files described in it.

Handles two kinds of input entries from the ETL config:
  - simple path strings (e.g. "input_excel": "data/input.xlsx")
  - "folder block" dicts (e.g. "input2": {"path": "...", "file1": "...", ...})
    where every "fileN" key holding a glob-like pattern is expanded against
    the folder's path.
"""

import glob
import json
import os
from pathlib import Path

import pandas as pd


def load_runtime_config() -> dict:
    """Read runtime_config.json written by the platform's execution engine.

    Falls back to a local ./config.json (useful for running the ETL
    standalone, outside the platform, for quick local testing).
    """
    cfg_path = os.environ.get("ETL_RUNTIME_CONFIG")
    if cfg_path and Path(cfg_path).exists():
        with open(cfg_path, "r", encoding="utf-8") as f:
            runtime = json.load(f)
        return runtime

    # Standalone fallback: build a minimal runtime structure from config.json
    local_cfg = Path(__file__).resolve().parent.parent / "config.json"
    with open(local_cfg, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    work_dir = Path(__file__).resolve().parent.parent
    return {
        "execution_id": "standalone",
        "etl_id": "standalone",
        "work_directory": str(work_dir),
        "outputs": {
            "directory": str(work_dir / "outputs"),
            "deleted": str(work_dir / "deleted"),
            "archive": str(work_dir / "archive"),
        },
        "config": cfg,
        "config_overrides": {},
    }


def _is_folder_block(value) -> bool:
    return isinstance(value, dict) and "path" in value


def _expand_patterns(folder_block: dict, logger=None) -> list[str]:
    """Expand every 'fileN' glob pattern inside a folder block into real
    file paths found on disk. Keys that are '-' or empty are skipped.
    Non-glob plain filenames are also matched directly.
    """
    base = folder_block.get("path", "")
    matched: list[str] = []

    for key, pattern in folder_block.items():
        if not key.lower().startswith("file"):
            continue
        if not isinstance(pattern, str) or not pattern or pattern == "-":
            continue

        full_pattern = str(Path(base) / pattern)
        found = glob.glob(full_pattern)

        if found:
            matched.extend(found)
        else:
            if logger:
                logger.warning(f"No files matched pattern '{pattern}' (key: {key}) in '{base}'")

    return sorted(set(matched))


def load_inputs(config: dict, logger=None) -> dict:
    """
    Reads all configured inputs and returns a dict of DataFrames / file lists:

      {
        "main_df": <DataFrame from input_excel>,
        "extra_files": [list of resolved file paths from input2],
        "extra_dfs": {filepath: DataFrame, ...}   # only for .xlsx files
      }
    """
    result = {"main_df": None, "extra_files": [], "extra_dfs": {}}

    # ── Primary input: input_excel ─────────────────────────────────
    main_path = config.get("input_excel")
    if main_path:
        p = Path(main_path)
        if p.exists():
            if logger:
                logger.info(f"Loading main input: {p}")
            result["main_df"] = pd.read_excel(p)
        else:
            if logger:
                logger.warning(f"input_excel not found: {p} (will use empty DataFrame)")
            result["main_df"] = pd.DataFrame()
    else:
        result["main_df"] = pd.DataFrame()

    # ── Secondary input: input2 (folder block with glob patterns) ────
    input2 = config.get("input2")
    if _is_folder_block(input2):
        files = _expand_patterns(input2, logger=logger)
        result["extra_files"] = files

        for f in files:
            if f.lower().endswith((".xlsx", ".xls")):
                try:
                    result["extra_dfs"][f] = pd.read_excel(f)
                    if logger:
                        logger.info(f"Loaded extra input: {f} ({len(result['extra_dfs'][f])} rows)")
                except Exception as e:
                    if logger:
                        logger.warning(f"Could not read '{f}': {e}")
            else:
                if logger:
                    logger.info(f"Found extra input (not loaded as table): {f}")

    return result
