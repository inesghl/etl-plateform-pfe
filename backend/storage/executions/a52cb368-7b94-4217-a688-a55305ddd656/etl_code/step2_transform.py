"""
Step 2 — Transform
Reads raw CSVs from step 1's snapshot.
Merges invoices with purchase orders on invoice_number, adds computed columns.
"""

import json
import os
import sys
from pathlib import Path

import pandas as pd


def load_inputs() -> dict:
    inputs_file = os.environ.get("ETL_STEP_INPUTS")
    if not inputs_file:
        print("[STEP2] ERROR: ETL_STEP_INPUTS not set", file=sys.stderr)
        sys.exit(1)
    return json.loads(Path(inputs_file).read_text(encoding="utf-8"))


def main():
    cfg = load_inputs()
    inputs     = cfg["inputs"]
    output_dir = Path(cfg["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    invoices_path = inputs.get("invoices", "")
    orders_path   = inputs.get("orders", "")

    if not Path(invoices_path).exists():
        print(f"[STEP2] ERROR: invoices CSV not found: {invoices_path}", file=sys.stderr)
        sys.exit(1)
    if not Path(orders_path).exists():
        print(f"[STEP2] ERROR: orders CSV not found: {orders_path}", file=sys.stderr)
        sys.exit(1)

    invoices = pd.read_csv(invoices_path)
    orders   = pd.read_csv(orders_path)

    print(f"[STEP2] Invoices: {len(invoices)} rows | Orders: {len(orders)} rows")

    # Merge on invoice_number (left join keeps all invoices)
    merged = invoices.merge(orders, on="invoice_number", how="left", suffixes=("_inv", "_ord"))

    # Computed column: amount difference between invoice and order
    if "amount_inv" in merged.columns and "amount_ord" in merged.columns:
        merged["amount_diff"] = merged["amount_inv"] - merged["amount_ord"]
    elif "amount" in merged.columns:
        merged["amount_diff"] = 0.0

    print(f"[STEP2] Merged: {len(merged)} rows")

    out_path = output_dir / "merged.csv"
    merged.to_csv(out_path, index=False)
    print(f"[STEP2] Saved merged → {out_path}")
    print("[STEP2] Transform complete.")


if __name__ == "__main__":
    main()
