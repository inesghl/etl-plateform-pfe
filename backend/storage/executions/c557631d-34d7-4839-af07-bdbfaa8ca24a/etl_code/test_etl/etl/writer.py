"""
etl/writer.py
───────────────
Writes the final outputs:
  - output_excel: one sheet per category group + a "summary" sheet
  - deleted_rows: rows removed by business rules, with their reason
"""

from pathlib import Path

import pandas as pd


def write_output(groups: dict[str, pd.DataFrame], summary_df: pd.DataFrame, output_path: str, logger=None) -> None:
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(p, engine="openpyxl") as writer:
        summary_df.to_excel(writer, sheet_name="summary", index=False)
        for sheet_name, df in groups.items():
            df.to_excel(writer, sheet_name=sheet_name, index=False)

    if logger:
        logger.info(f"Wrote output Excel: {p} ({len(groups)} group sheet(s) + summary)")


def write_deleted(deleted_df: pd.DataFrame, deleted_path: str, logger=None) -> None:
    p = Path(deleted_path)
    p.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(p, engine="openpyxl") as writer:
        if deleted_df.empty:
            pd.DataFrame(columns=["id", "name", "category", "score", "quantity", "_delete_reason"]).to_excel(
                writer, sheet_name="deleted_rows", index=False
            )
        else:
            deleted_df.to_excel(writer, sheet_name="deleted_rows", index=False)

    if logger:
        logger.info(f"Wrote deleted-rows Excel: {p} ({len(deleted_df)} row(s))")
