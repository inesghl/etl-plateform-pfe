"""
etl/writer.py
───────────────
Writes the final outputs to absolute paths from the config:
  - output_report     : summary sheet + one sheet per project_code
  - rejected_invoices : invoices that failed reconciliation, with reasons
"""

from pathlib import Path

import pandas as pd

RECONCILED_COLS = [
    "invoice_number", "po_number", "supplier_id", "supplier_name", "country",
    "project_code", "invoice_date", "due_date", "amount_excl_vat",
    "po_amount_excl_vat", "vat_amount", "total_amount", "status",
    "days_to_due", "is_overdue",
]

REJECTED_COLS = [
    "invoice_number", "po_number", "supplier_id", "amount_excl_vat",
    "vat_amount", "total_amount", "po_amount_excl_vat", "_reject_reason",
]


def write_output(groups: dict[str, pd.DataFrame], summary_df: pd.DataFrame, output_path: str, logger=None) -> None:
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(p, engine="openpyxl") as writer:
        summary_df.to_excel(writer, sheet_name="summary", index=False)
        for sheet_name, df in groups.items():
            cols = [c for c in RECONCILED_COLS if c in df.columns]
            df[cols].to_excel(writer, sheet_name=sheet_name, index=False)

    if logger:
        logger.info(f"Wrote reconciliation report: {p} ({len(groups)} project sheet(s) + summary)")


def write_rejected(rejected_df: pd.DataFrame, output_path: str, logger=None) -> None:
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(p, engine="openpyxl") as writer:
        if rejected_df.empty:
            pd.DataFrame(columns=REJECTED_COLS).to_excel(writer, sheet_name="rejected_invoices", index=False)
        else:
            cols = [c for c in REJECTED_COLS if c in rejected_df.columns]
            rejected_df[cols].to_excel(writer, sheet_name="rejected_invoices", index=False)

    if logger:
        logger.info(f"Wrote rejected-invoices report: {p} ({len(rejected_df)} invoice(s))")
