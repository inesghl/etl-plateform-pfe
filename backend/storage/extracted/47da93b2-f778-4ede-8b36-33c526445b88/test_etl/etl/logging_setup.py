"""
etl/logging_setup.py
─────────────────────
Configures a simple logger that writes to the ETL platform's logs_dir
(resolved from runtime config) AND to stdout (so it shows up in the
execution's stdout_log on the platform).
"""

import logging
import sys
from pathlib import Path


def setup_logger(name: str, logs_dir: str | None = None) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    # Avoid adding duplicate handlers if called multiple times
    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    # Console handler -> goes into execution.stdout_log on the platform
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    logger.addHandler(console)

    # File handler -> persisted under work_dir/logs/
    if logs_dir:
        try:
            log_path = Path(logs_dir)
            log_path.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(log_path / "etl_run.log", encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except Exception as e:
            logger.warning(f"Could not create log file in '{logs_dir}': {e}")

    return logger
