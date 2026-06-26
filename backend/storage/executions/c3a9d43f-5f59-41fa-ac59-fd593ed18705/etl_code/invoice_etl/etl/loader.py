"""
etl/loader.py
──────────────
Loads runtime_config.json (written by the platform) and reads the
invoice-reconciliation inputs. ALL input/output paths come from the config
and point to locations on the user's machine (e.g. Desktop folders) — no
data is bundled inside the ETL package itself.

Expected config keys:
  - invoices_excel          : path to the invoices export
  - purchase_orders_excel   : path to the purchase-orders export
  - suppliers_folder        : folder block with:
        file1 -> "suppliers_*.xlsx"  (supplier master data, one or more files)
        file2 -> "blacklist_*.xlsx"  (blacklisted suppliers, optional)
        file3 -> "-"                  (unused slot)
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
            return json.load(f)

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
    """Expand every 'fileN' glob pattern in a folder block into real files.
    '-' marks an intentionally unused slot. 'files number' (if numeric) is
    the expected file count in the folder; a mismatch is logged."""
    base = folder_block.get("path", "")
    matched: list[str] = []

    for key, pattern in folder_block.items():
        if not key.lower().startswith("file") or key.lower() == "files number":
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

    matched = sorted(set(matched))

    expected = folder_block.get("files number")
    if isinstance(expected, (int, float)):
        try:
            actual_total = len([f for f in Path(base).iterdir() if f.is_file()])
        except Exception as e:
            actual_total = -1
            if logger:
                logger.warning(f"Could not count files in '{base}': {e}")
        if logger and actual_total != -1 and actual_total != int(expected):
            logger.warning(
                f"'files number' expects {int(expected)} file(s) in '{base}', "
                f"but found {actual_total}."
            )

    return matched


def _read_excel(path: str, label: str, logger=None) -> pd.DataFrame:
    p = Path(path)
    if not p.exists():
        if logger:
            logger.warning(f"{label} not found: {p}")
        return pd.DataFrame()
    if logger:
        logger.info(f"Loading {label}: {p}")
    return pd.read_excel(p)


def load_inputs(config: dict, logger=None) -> dict:
    """
    Returns:
      {
        "invoices_df": DataFrame,
        "po_df": DataFrame,
        "suppliers_df": DataFrame,     concatenation of all suppliers_*.xlsx
        "blacklist_df": DataFrame,     concatenation of all blacklist_*.xlsx
      }
    """
    result = {
        "invoices_df": pd.DataFrame(),
        "po_df": pd.DataFrame(),
        "suppliers_df": pd.DataFrame(),
        "blacklist_df": pd.DataFrame(),
    }

    result["invoices_df"] = _read_excel(config.get("invoices_excel", ""), "invoices", logger=logger)
    result["po_df"] = _read_excel(config.get("purchase_orders_excel", ""), "purchase orders", logger=logger)

    folder = config.get("suppliers_folder")
    if _is_folder_block(folder):
        files = _expand_patterns(folder, logger=logger)

        supplier_frames, blacklist_frames = [], []
        for f in files:
            name = Path(f).name.lower()
            try:
                df = pd.read_excel(f)
            except Exception as e:
                if logger:
                    logger.warning(f"Could not read '{f}': {e}")
                continue

            if "blacklist" in name:
                blacklist_frames.append(df)
                if logger:
                    logger.info(f"Loaded blacklist file: {f} ({len(df)} rows)")
            elif "supplier" in name:
                supplier_frames.append(df)
                if logger:
                    logger.info(f"Loaded supplier master file: {f} ({len(df)} rows)")
            else:
                if logger:
                    logger.info(f"Unrecognized file in suppliers_folder (skipped): {f}")

        if supplier_frames:
            result["suppliers_df"] = pd.concat(supplier_frames, ignore_index=True)
        if blacklist_frames:
            result["blacklist_df"] = pd.concat(blacklist_frames, ignore_index=True)

    return result
