"""
Step 1 — Extract
Reads the raw input Excel files and saves them as CSVs into the output snapshot.

How the step engine communicates with this script:
  - ETL_STEP_INPUTS env var → path to step_inputs.json
  - step_inputs.json contains:
      { "inputs": { "invoices": "/abs/path.xlsx", "orders": "/abs/path.xlsx" },
        "output_dir": "/abs/path/steps/extract/output/" }
"""

import json
import os
import sys
from pathlib import Path

import pandas as pd


def load_inputs() -> dict:
    inputs_file = os.environ.get("ETL_STEP_INPUTS")
    if not inputs_file:
        print("[STEP1] ERROR: ETL_STEP_INPUTS not set", file=sys.stderr)
        sys.exit(1)
    return json.loads(Path(inputs_file).read_text(encoding="utf-8"))


def main():
    cfg = load_inputs()
    inputs     = cfg["inputs"]
    output_dir = Path(cfg["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── Read invoices ──────────────────────────────────────────
    invoices_path = inputs.get("invoices", "")
    if not invoices_path or not Path(invoices_path).exists():
        print(f"[STEP1] ERROR: invoices file not found: {invoices_path}", file=sys.stderr)
        sys.exit(1)

    invoices_df = pd.read_excel(invoices_path)
    print(f"[STEP1] Loaded {len(invoices_df)} invoices from {Path(invoices_path).name}")

    # Normalise column names
    invoices_df.columns = [c.strip().lower().replace(" ", "_") for c in invoices_df.columns]

    out_invoices = output_dir / "raw_invoices.csv"
    invoices_df.to_csv(out_invoices, index=False)
    print(f"[STEP1] Saved raw invoices → {out_invoices}")

    # ── Read purchase orders ───────────────────────────────────
    orders_path = inputs.get("purchase_orders", "")
    if not orders_path or not Path(orders_path).exists():
        print(f"[STEP1] ERROR: purchase_orders file not found: {orders_path}", file=sys.stderr)
        sys.exit(1)

    orders_df = pd.read_excel(orders_path)
    print(f"[STEP1] Loaded {len(orders_df)} purchase orders from {Path(orders_path).name}")

    orders_df.columns = [c.strip().lower().replace(" ", "_") for c in orders_df.columns]

    out_orders = output_dir / "raw_orders.csv"
    orders_df.to_csv(out_orders, index=False)
    print(f"[STEP1] Saved raw orders → {out_orders}")

    print("[STEP1] Extract complete.")


if __name__ == "__main__":
    main()
