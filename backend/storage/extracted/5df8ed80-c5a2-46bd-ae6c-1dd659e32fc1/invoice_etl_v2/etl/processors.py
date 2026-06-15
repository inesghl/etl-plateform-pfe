"""
etl/processors.py
───────────────────
Normalizes invoices, purchase orders and supplier master data, then joins
invoices with their matching PO and supplier info.
"""

import pandas as pd


def normalize_invoices(df: pd.DataFrame, logger=None) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]

    for col in ("invoice_number", "po_number", "supplier_id", "status"):
        if col not in df.columns:
            df[col] = pd.NA
        df[col] = df[col].astype("string").str.strip()

    for col in ("amount_excl_vat", "vat_amount", "total_amount"):
        if col not in df.columns:
            df[col] = pd.NA
        df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in ("invoice_date", "due_date"):
        if col not in df.columns:
            df[col] = pd.NaT
        df[col] = pd.to_datetime(df[col], errors="coerce")

    if logger:
        logger.info(f"Normalized invoices: {len(df)} row(s).")
    return df


def normalize_purchase_orders(df: pd.DataFrame, logger=None) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]

    for col in ("po_number", "supplier_id", "project_code"):
        if col not in df.columns:
            df[col] = pd.NA
        df[col] = df[col].astype("string").str.strip()

    if "po_amount_excl_vat" not in df.columns:
        df["po_amount_excl_vat"] = pd.NA
    df["po_amount_excl_vat"] = pd.to_numeric(df["po_amount_excl_vat"], errors="coerce")

    if logger:
        logger.info(f"Normalized purchase orders: {len(df)} row(s).")
    return df


def normalize_suppliers(df: pd.DataFrame, logger=None) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["supplier_id", "supplier_name", "country", "payment_terms_days"])

    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]

    for col in ("supplier_id", "supplier_name", "country"):
        if col not in df.columns:
            df[col] = pd.NA
        df[col] = df[col].astype("string").str.strip()

    if "payment_terms_days" not in df.columns:
        df["payment_terms_days"] = pd.NA
    df["payment_terms_days"] = pd.to_numeric(df["payment_terms_days"], errors="coerce")

    # De-duplicate in case multiple supplier files overlap
    df = df.drop_duplicates(subset=["supplier_id"], keep="last")

    if logger:
        logger.info(f"Normalized supplier master data: {len(df)} supplier(s).")
    return df


def normalize_blacklist(df: pd.DataFrame, logger=None) -> set[str]:
    if df.empty:
        return set()

    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    if "supplier_id" not in df.columns:
        return set()

    ids = set(df["supplier_id"].astype("string").str.strip().dropna())
    if logger:
        logger.info(f"Loaded blacklist: {len(ids)} supplier(s).")
    return ids


def build_invoice_view(invoices: pd.DataFrame, pos: pd.DataFrame, suppliers: pd.DataFrame, logger=None) -> pd.DataFrame:
    """Left-join invoices -> matching PO -> supplier master data."""
    df = invoices.merge(
        pos[["po_number", "po_amount_excl_vat", "project_code"]],
        on="po_number", how="left", suffixes=("", "_po"),
    )
    df = df.merge(suppliers, on="supplier_id", how="left")

    if logger:
        matched_po = df["po_amount_excl_vat"].notna().sum()
        matched_supplier = df["supplier_name"].notna().sum()
        logger.info(
            f"Joined invoices -> PO ({matched_po}/{len(df)} matched) "
            f"-> supplier master ({matched_supplier}/{len(df)} matched)."
        )

    return df
