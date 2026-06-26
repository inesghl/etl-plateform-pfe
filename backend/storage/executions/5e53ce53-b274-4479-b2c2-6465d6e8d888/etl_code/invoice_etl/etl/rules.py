"""
etl/rules.py
─────────────
Invoice reconciliation business rules. Invoices failing a rule are removed
from the "reconciled" set and routed to "rejected_invoices" with a reason.

Rules (checked in order, first match wins):
  1. po_not_found        : no matching purchase order for po_number
  2. supplier_blacklisted: supplier_id is on the blacklist
  3. amount_mismatch      : |invoice amount_excl_vat - PO amount| > amount_tolerance
  4. vat_mismatch         : |vat_amount - amount_excl_vat * vat_rate| > amount_tolerance
                            OR |total_amount - (amount_excl_vat + vat_amount)| > amount_tolerance
"""

import pandas as pd


def apply_rules(df: pd.DataFrame, config: dict, blacklist: set[str], logger=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    tolerance = config.get("amount_tolerance", 5.0)
    vat_rate = config.get("vat_rate", 0.19)

    df = df.copy()
    df["_reject_reason"] = pd.NA

    po_not_found = df["po_amount_excl_vat"].isna()
    df.loc[po_not_found, "_reject_reason"] = "po_not_found"

    blacklisted = df["_reject_reason"].isna() & df["supplier_id"].isin(blacklist)
    df.loc[blacklisted, "_reject_reason"] = "supplier_blacklisted"

    amount_diff = (df["amount_excl_vat"] - df["po_amount_excl_vat"]).abs()
    amount_mismatch = df["_reject_reason"].isna() & (amount_diff > tolerance)
    df.loc[amount_mismatch, "_reject_reason"] = "amount_mismatch"

    expected_vat = df["amount_excl_vat"] * vat_rate
    vat_diff = (df["vat_amount"] - expected_vat).abs()
    total_diff = (df["total_amount"] - (df["amount_excl_vat"] + df["vat_amount"])).abs()
    vat_mismatch = df["_reject_reason"].isna() & ((vat_diff > tolerance) | (total_diff > tolerance))
    df.loc[vat_mismatch, "_reject_reason"] = "vat_mismatch"

    rejected_df = df[df["_reject_reason"].notna()].copy()
    reconciled_df = df[df["_reject_reason"].isna()].copy().drop(columns=["_reject_reason"])

    if logger:
        logger.info(
            f"Applied reconciliation rules (tolerance={tolerance}, vat_rate={vat_rate}): "
            f"{len(reconciled_df)} reconciled, {len(rejected_df)} rejected."
        )
        if not rejected_df.empty:
            for reason, count in rejected_df["_reject_reason"].value_counts().items():
                logger.info(f"  - {reason}: {count} invoice(s)")

    return reconciled_df, rejected_df
