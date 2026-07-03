"""
etl/measures.py
─────────────────
Adds computed columns to reconciled invoices and a per-supplier summary.
"""

import pandas as pd


def add_measures(df: pd.DataFrame, config: dict, logger=None) -> pd.DataFrame:
    reference_date = pd.to_datetime(config.get("reference_date") or pd.Timestamp.today())
    overdue_days = config.get("payment_overdue_days", 30)

    df = df.copy()

    df["days_to_due"] = (df["due_date"] - reference_date).dt.days
    df["is_overdue"] = (df["status"].astype("string").str.lower() != "paid") & (
        df["days_to_due"].fillna(0) < -overdue_days
    )

    if logger:
        n_overdue = int(df["is_overdue"].sum())
        logger.info(f"Added measures: days_to_due, is_overdue ({n_overdue} overdue invoice(s)).")

    return df


def supplier_summary(df: pd.DataFrame, logger=None) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=[
            "supplier_id", "supplier_name", "country",
            "invoice_count", "total_excl_vat", "total_vat", "total_amount", "overdue_count",
        ])

    summary = (
        df.groupby(["supplier_id", "supplier_name", "country"], dropna=False)
        .agg(
            invoice_count=("invoice_number", "count"),
            total_excl_vat=("amount_excl_vat", "sum"),
            total_vat=("vat_amount", "sum"),
            total_amount=("total_amount", "sum"),
            overdue_count=("is_overdue", "sum"),
        )
        .reset_index()
        .sort_values("total_amount", ascending=False)
    )

    if logger:
        logger.info(f"Built supplier summary: {len(summary)} supplier(s).")

    return summary
