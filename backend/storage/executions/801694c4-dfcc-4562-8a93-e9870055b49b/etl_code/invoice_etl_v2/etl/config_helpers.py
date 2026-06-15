"""
etl/config_helpers.py
────────────────────────
Defensive config readers. The platform allows users to override config
values via the launch form, and the form does not always send the right
type for the right key (e.g. a date-picker value can land on a numeric
field like 'amount_tolerance'). These helpers coerce-or-fallback so the
ETL never crashes on a bad override — it logs a warning and uses the
ETL's default instead.
"""


def get_float(config: dict, key: str, default: float, logger=None) -> float:
    val = config.get(key, default)
    try:
        return float(val)
    except (TypeError, ValueError):
        if logger:
            logger.warning(
                f"Config key '{key}' = {val!r} is not a valid number. "
                f"Falling back to default: {default}."
            )
        return float(default)


def get_int(config: dict, key: str, default: int, logger=None) -> int:
    val = config.get(key, default)
    try:
        return int(float(val))
    except (TypeError, ValueError):
        if logger:
            logger.warning(
                f"Config key '{key}' = {val!r} is not a valid integer. "
                f"Falling back to default: {default}."
            )
        return int(default)
