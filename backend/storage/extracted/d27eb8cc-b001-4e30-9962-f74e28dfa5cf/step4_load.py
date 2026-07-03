"""
Step 4 — Load
Reads validated CSV from step 3 and raw orders from step 1.
Produces the final Excel reconciliation report.

Note: inputs come from two different steps (step 1 and step 3),
demonstrating the flexible wiring system.
"""

import json
import os
import sys
from pathlib import Path

import pandas as pd


def load_inputs() -> dict:
    inputs_file = os.environ.get("ETL_STEP_INPUTS")
    if not inputs_file:
        print("[STEP4] ERROR: ETL_STEP_INPUTS not set", file=sys.stderr)
        sys.exit(1)
    return json.loads(Path(inputs_file).read_text(encoding="utf-8"))


def main():
    cfg = load_inputs()
    inputs     = cfg["inputs"]
    output_dir = Path(cfg["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    data_path      = inputs.get("data", "")
    raw_orders_path = inputs.get("raw_orders", "")

    if not Path(data_path).exists():
        print(f"[STEP4] ERROR: validated CSV not found: {data_path}", file=sys.stderr)
        sys.exit(1)
    if not Path(raw_orders_path).exists():
        print(f"[STEP4] ERROR: raw_orders CSV not found: {raw_orders_path}", file=sys.stderr)
        sys.exit(1)

    validated  = pd.read_csv(data_path)
    raw_orders = pd.read_csv(raw_orders_path)

    print(f"[STEP4] Validated rows: {len(validated)} | Raw orders: {len(raw_orders)}")

    out_path = output_dir / "final_report.xlsx"

    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        validated.to_excel(writer, sheet_name="Reconciled Invoices", index=False)
        raw_orders.to_excel(writer, sheet_name="Purchase Orders", index=False)

        # Summary sheet
        summary = pd.DataFrame({
            "Metric": ["Total validated invoices", "Total purchase orders"],
            "Count":  [len(validated), len(raw_orders)],
        })
        summary.to_excel(writer, sheet_name="Summary", index=False)

    print(f"[STEP4] Final report saved → {out_path}")
    print("[STEP4] Load complete.")


if __name__ == "__main__":
    main()
