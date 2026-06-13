"""
etl/measures.py
─────────────────
Adds computed columns ("measures") to the kept dataset, and produces a
small summary table (per-category aggregation).
"""

import pandas as pd


def add_measures(df: pd.DataFrame, logger=None) -> pd.DataFrame:
    df = df.copy()

    df["score_x_quantity"] = (df["score"].fillna(0) * df["quantity"].fillna(0))

    df["score_band"] = pd.cut(
        df["score"].fillna(0),
        bins=[-1, 25, 50, 75, 100],
        labels=["very_low", "low", "medium", "high"],
    ).astype("string")

    if logger:
        logger.info(f"Added measures: score_x_quantity, score_band ({len(df)} row(s)).")

    return df


def category_summary(df: pd.DataFrame, logger=None) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["category", "row_count", "avg_score", "total_quantity"])

    summary = (
        df.groupby("category", dropna=False)
        .agg(
            row_count=("id", "count"),
            avg_score=("score", "mean"),
            total_quantity=("quantity", "sum"),
        )
        .reset_index()
        .sort_values("category")
    )

    if logger:
        logger.info(f"Built category summary: {len(summary)} category/ies.")

    return summary
