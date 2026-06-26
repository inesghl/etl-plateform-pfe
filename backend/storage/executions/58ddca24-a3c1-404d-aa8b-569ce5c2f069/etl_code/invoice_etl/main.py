"""
main.py
────────
Invoice ↔ Purchase Order reconciliation ETL (enterprise finance use case).

Pipeline:
  1. Load invoices, purchase orders, supplier master data + blacklist
     (all paths come from config -> point to files on the user's machine,
     e.g. Desktop folders; nothing is bundled inside this package)
  2. Normalize all datasets and join invoices -> PO -> supplier
  3. Apply reconciliation rules -> reconciled vs. rejected invoices
  4. Compute measures (days to due, overdue flag) + per-supplier summary
  5. Split reconciled invoices by project_code
  6. Write reconciliation_report.xlsx and rejected_invoices.xlsx

Env vars set by the platform:
  - ETL_RUNTIME_CONFIG : path to runtime_config.json
  - ETL_WORK_DIR       : working directory (also the CWD)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from etl.logging_setup import setup_logger
from etl.loader import load_runtime_config, load_inputs
from etl.processors import (
    normalize_invoices, normalize_purchase_orders,
    normalize_suppliers, normalize_blacklist, build_invoice_view,
)
from etl.rules import apply_rules
from etl.measures import add_measures, supplier_summary
from etl.splitter import split_by_project
from etl.writer import write_output, write_rejected


def main() -> None:
    runtime = load_runtime_config()
    config = runtime.get("config", {})

    logger = setup_logger("etl", logs_dir=config.get("logs_dir"))
    logger.info("=" * 50)
    logger.info(f"Starting invoice reconciliation ETL run (execution_id={runtime.get('execution_id')})")
    logger.info("=" * 50)

    # ── Load ──────────────────────────────────────────────────────
    inputs = load_inputs(config, logger=logger)

    # ── Process ───────────────────────────────────────────────────
    invoices = normalize_invoices(inputs["invoices_df"], logger=logger)
    pos = normalize_purchase_orders(inputs["po_df"], logger=logger)
    suppliers = normalize_suppliers(inputs["suppliers_df"], logger=logger)
    blacklist = normalize_blacklist(inputs["blacklist_df"], logger=logger)

    joined = build_invoice_view(invoices, pos, suppliers, logger=logger)

    # ── Rules ─────────────────────────────────────────────────────
    reconciled, rejected = apply_rules(joined, config, blacklist, logger=logger)

    # ── Measures ──────────────────────────────────────────────────
    reconciled = add_measures(reconciled, config, logger=logger)
    summary_df = supplier_summary(reconciled, logger=logger)

    # ── Split ─────────────────────────────────────────────────────
    groups = split_by_project(reconciled, logger=logger)

    # ── Write ─────────────────────────────────────────────────────
    output_path = config.get("output_report", "outputs/reconciliation_report.xlsx")
    rejected_path = config.get("rejected_invoices", "outputs/rejected_invoices.xlsx")

    write_output(groups, summary_df, output_path, logger=logger)
    write_rejected(rejected, rejected_path, logger=logger)

    logger.info("Invoice reconciliation ETL run completed successfully.")


if __name__ == "__main__":
    main()
