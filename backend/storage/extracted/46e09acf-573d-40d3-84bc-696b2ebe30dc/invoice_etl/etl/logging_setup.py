"""
etl/logging_setup.py
─────────────────────
Logger that writes to logs_dir (from config) AND to stdout, so output is
captured both on disk and in the platform's execution.stdout_log.
"""

import logging
import sys
from pathlib import Path


def setup_logger(name: str, logs_dir: str | None = None) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    logger.addHandler(console)

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
