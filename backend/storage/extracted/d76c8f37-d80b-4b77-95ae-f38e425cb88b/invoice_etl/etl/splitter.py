"""
etl/splitter.py
─────────────────
Splits reconciled invoices into groups (one per 'project_code'), so the
writer can output each group to its own Excel sheet.
"""

import pandas as pd


def split_by_project(df: pd.DataFrame, logger=None) -> dict[str, pd.DataFrame]:
    if df.empty or "project_code" not in df.columns:
        return {"all": df}

    groups: dict[str, pd.DataFrame] = {}
    for project, sub in df.groupby("project_code", dropna=False):
        sheet_name = str(project) if pd.notna(project) else "no_project"
        groups[sheet_name[:31]] = sub.reset_index(drop=True)

    if logger:
        logger.info(f"Split reconciled invoices into {len(groups)} project sheet(s): {list(groups.keys())}")

    return groups
