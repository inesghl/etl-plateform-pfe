"""
etl/processors.py
───────────────────
Basic data cleaning / normalization steps applied to the main input
DataFrame before business rules and measures are applied.

If the main DataFrame is empty (e.g. no input_excel provided / found),
a small built-in sample dataset is generated so the ETL still produces
meaningful output — handy for first-time testing on the platform.
"""

import pandas as pd


SAMPLE_DATA = [
    {"id": 1, "name": "Alpha",   "category": "A", "score": 82, "quantity": 10},
    {"id": 2, "name": "Bravo",   "category": "B", "score": 45, "quantity": 5},
    {"id": 3, "name": "Charlie", "category": "A", "score": 91, "quantity": 7},
    {"id": 4, "name": "Delta",   "category": "C", "score": 30, "quantity": 12},
    {"id": 5, "name": "Echo",    "category": "B", "score": 67, "quantity": 3},
    {"id": 6, "name": "Foxtrot", "category": "A", "score": None, "quantity": 8},
    {"id": 7, "name": "Golf",    "category": "C", "score": 55, "quantity": 0},
    {"id": 8, "name": "Hotel",   "category": "B", "score": 12, "quantity": 4},
]


def normalize_main(df: pd.DataFrame, logger=None) -> pd.DataFrame:
    if df is None or df.empty:
        if logger:
            logger.info("Main input is empty — using built-in sample dataset.")
        df = pd.DataFrame(SAMPLE_DATA)

    df = df.copy()

    # Normalize column names: strip whitespace, lowercase
    df.columns = [str(c).strip().lower() for c in df.columns]

    # Ensure expected columns exist (fill with NaN if missing)
    for col in ("id", "name", "category", "score", "quantity"):
        if col not in df.columns:
            df[col] = pd.NA

    # Strip whitespace from string columns
    for col in ("name", "category"):
        if col in df.columns:
            df[col] = df[col].astype("string").str.strip()

    # Coerce numeric columns
    for col in ("score", "quantity"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    if logger:
        logger.info(f"Normalized main dataset: {len(df)} row(s), columns={list(df.columns)}")

    return df


def merge_extra_files(main_df: pd.DataFrame, extra_dfs: dict, logger=None) -> pd.DataFrame:
    """Append any rows from extra Excel files (input2 folder) that share the
    same normalized columns as the main dataset. Files with incompatible
    columns are skipped (logged) rather than crashing the run."""
    if not extra_dfs:
        return main_df

    frames = [main_df]
    for path, df in extra_dfs.items():
        try:
            df = df.copy()
            df.columns = [str(c).strip().lower() for c in df.columns]
            common_cols = [c for c in main_df.columns if c in df.columns]
            if not common_cols:
                if logger:
                    logger.info(f"Skipping '{path}': no matching columns with main dataset.")
                continue
            frames.append(df[common_cols])
            if logger:
                logger.info(f"Merged {len(df)} row(s) from '{path}'.")
        except Exception as e:
            if logger:
                logger.warning(f"Could not merge '{path}': {e}")

    merged = pd.concat(frames, ignore_index=True, sort=False)
    return merged
