# IO + validation
import pandas as pd
import logging

log = logging.getLogger(__name__)

def load_and_validate(path, schema: dict) -> pd.DataFrame:
    df = pd.read_excel(path)
    log.info("Input loaded: %s rows", len(df))

    for col, dtype in schema.items():
        if col not in df.columns:
            raise ValueError(f"Missing column: {col}")
        df[col] = df[col].astype(dtype, errors="ignore")

    log.info("Schema validated")
    return df
