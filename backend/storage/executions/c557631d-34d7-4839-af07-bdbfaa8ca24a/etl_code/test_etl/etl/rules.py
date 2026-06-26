"""
etl/rules.py
─────────────
Business rules applied to the dataset. Rows that fail a rule are removed
from the "kept" dataset and routed to the "deleted_rows" output instead.

Rules implemented here (simple, easy to tweak for testing):
  1. Rows with a missing/NaN 'score' are deleted (reason: missing_score).
  2. Rows with 'score' below `min_score` (from config, default 50) are
     deleted (reason: below_min_score).
  3. Rows with 'quantity' <= 0 are deleted (reason: zero_or_negative_quantity).
"""

import pandas as pd


def apply_rules(df: pd.DataFrame, config: dict, logger=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    min_score = config.get("min_score", 50)

    df = df.copy()
    df["_delete_reason"] = pd.NA

    missing_score = df["score"].isna()
    df.loc[missing_score, "_delete_reason"] = "missing_score"

    below_min = (~missing_score) & (df["score"] < min_score)
    df.loc[below_min, "_delete_reason"] = "below_min_score"

    bad_qty = df["_delete_reason"].isna() & (df["quantity"].fillna(0) <= 0)
    df.loc[bad_qty, "_delete_reason"] = "zero_or_negative_quantity"

    deleted_df = df[df["_delete_reason"].notna()].copy()
    kept_df = df[df["_delete_reason"].isna()].copy().drop(columns=["_delete_reason"])

    if logger:
        logger.info(
            f"Applied rules (min_score={min_score}): "
            f"{len(kept_df)} kept, {len(deleted_df)} deleted."
        )
        if not deleted_df.empty:
            for reason, count in deleted_df["_delete_reason"].value_counts().items():
                logger.info(f"  - {reason}: {count} row(s)")

    return kept_df, deleted_df
