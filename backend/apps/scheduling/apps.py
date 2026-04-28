

import threading
import time
import logging
import os

from django.apps import AppConfig

logger = logging.getLogger("scheduling")


class SchedulingConfig(AppConfig):
    name         = "apps.scheduling"
    default_auto_field = "django.db.models.BigAutoField"
    label = 'scheduling'
    def ready(self):
        # Django calls ready() twice in dev
        # The RUN_MAIN env var is only set in the child (real) process.
        if os.environ.get("RUN_MAIN") != "true":
            # We're in the autoreloader parent — skip.
            # In production / gunicorn this guard is harmless (RUN_MAIN isn't set,
            # but the thread starts only once because ready() is called once).
            # To support both dev and prod, also check a flag:
            pass

        _start_scheduler_thread()


def _start_scheduler_thread():
    thread = threading.Thread(target=_scheduler_loop, name="etl-scheduler", daemon=True)
    thread.start()
    logger.info("[SCHEDULER] Background thread started (polling every 60s)")


def _scheduler_loop():
    """Poll every 60 seconds. Survives individual check errors."""
    # Wait a few seconds after startup so Django is fully initialised
    time.sleep(10)
    while True:
        try:
            from .scheduler import check_and_fire_schedules
            check_and_fire_schedules()
        except Exception as exc:
            logger.error("[SCHEDULER] Loop error: %s", exc, exc_info=True)
        time.sleep(60)