"""
etl/splitter.py
─────────────────
Splits the final dataset into groups (one per 'category' value), so the
writer can output each group to its own Excel sheet.
"""

import pandas as pd


def split_by_category(df: pd.DataFrame, logger=None) -> dict[str, pd.DataFrame]:
    if df.empty or "category" not in df.columns:
        return {"all": df}

    groups: dict[str, pd.DataFrame] = {}
    for cat, sub in df.groupby("category", dropna=False):
        sheet_name = str(cat) if pd.notna(cat) else "uncategorized"
        groups[sheet_name[:31]] = sub.reset_index(drop=True)  # Excel sheet name limit = 31 chars

    if logger:
        logger.info(f"Split dataset into {len(groups)} group(s): {list(groups.keys())}")

    return groups
