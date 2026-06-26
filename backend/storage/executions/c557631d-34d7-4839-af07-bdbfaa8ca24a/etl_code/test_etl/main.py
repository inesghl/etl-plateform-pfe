"""
main.py
────────
Entry point for the ETL. Orchestrates: load -> process -> rules -> measures
-> split -> write.

The platform sets two environment variables before running this script:
  - ETL_RUNTIME_CONFIG : path to runtime_config.json (contains the
                          effective/merged config for this execution)
  - ETL_WORK_DIR       : the working directory (CWD is already set to this)

Output paths (output_excel, deleted_rows, logs_dir) come from the config and
are resolved relative to the working directory by the platform's
_prepare_output_dirs step, so this script can just write to them directly.
"""

import sys
from pathlib import Path

# Allow `import etl.xxx` when running as a script from work_dir
sys.path.insert(0, str(Path(__file__).resolve().parent))

from etl.logging_setup import setup_logger
from etl.loader import load_runtime_config, load_inputs
from etl.processors import normalize_main, merge_extra_files
from etl.rules import apply_rules
from etl.measures import add_measures, category_summary
from etl.splitter import split_by_category
from etl.writer import write_output, write_deleted


def main() -> None:
    runtime = load_runtime_config()
    config = runtime.get("config", {})

    logger = setup_logger("etl", logs_dir=config.get("logs_dir"))
    logger.info("=" * 50)
    logger.info(f"Starting ETL run (execution_id={runtime.get('execution_id')})")
    logger.info("=" * 50)

    # ── Load ──────────────────────────────────────────────────────
    inputs = load_inputs(config, logger=logger)

    # ── Process ───────────────────────────────────────────────────
    df = normalize_main(inputs["main_df"], logger=logger)
    df = merge_extra_files(df, inputs["extra_dfs"], logger=logger)

    # ── Rules ─────────────────────────────────────────────────────
    kept_df, deleted_df = apply_rules(df, config, logger=logger)

    # ── Measures ──────────────────────────────────────────────────
    kept_df = add_measures(kept_df, logger=logger)
    summary_df = category_summary(kept_df, logger=logger)

    # ── Split ─────────────────────────────────────────────────────
    groups = split_by_category(kept_df, logger=logger)

    # ── Write ─────────────────────────────────────────────────────
    output_path = config.get("output_excel", "outputs/final_output.xlsx")
    deleted_path = config.get("deleted_rows", "deleted/deleted_rows.xlsx")

    write_output(groups, summary_df, output_path, logger=logger)
    write_deleted(deleted_df, deleted_path, logger=logger)

    logger.info("ETL run completed successfully.")


if __name__ == "__main__":
    main()
