import os
import sys
import threading
import time
import logging

from django.apps import AppConfig

logger = logging.getLogger("scheduling")
_scheduler_started = False


class SchedulingConfig(AppConfig):
    name = "apps.scheduling"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        global _scheduler_started
        if _scheduler_started:
            print("[SCHEDULER] ready() called again — already started, skipping")
            return

        run_main     = os.environ.get("RUN_MAIN")
        is_runserver = "runserver" in sys.argv
        use_reloader = is_runserver and "--noreload" not in sys.argv

        print(f"[SCHEDULER] ready() — run_main={run_main!r} is_runserver={is_runserver} use_reloader={use_reloader}")

        if use_reloader and run_main != "true":
            print("[SCHEDULER] Skipping — this is the reloader parent, not the worker")
            return

        _scheduler_started = True
        _start_scheduler_thread()


def _start_scheduler_thread():
    thread = threading.Thread(target=_scheduler_loop, name="etl-scheduler", daemon=True)
    thread.start()
    print("[SCHEDULER] ✓ Background thread started — polling every 60s")


def _seconds_until_next_minute() -> float:
    """How long to sleep so the next tick lands right at the top of the next
    minute (HH:MM:00), instead of drifting by however many seconds the loop
    happened to start at. A 0.2s cushion avoids waking up just *before* the
    boundary and missing a schedule due exactly then."""
    return 60 - (time.time() % 60) + 0.2


def _scheduler_loop():
    print("[SCHEDULER] Loop starting, waiting 10s for Django to finish init...")
    time.sleep(10)
    # First tick fires immediately (same as before) — only the gap BETWEEN
    # ticks is aligned to the minute boundary, so we never delay the very
    # first check after a restart.
    print("[SCHEDULER] Loop ready — first tick in progress")
    while True:
        try:
            from .scheduler import check_and_fire_schedules
            check_and_fire_schedules()
        except Exception as exc:
            print(f"[SCHEDULER] ❌ Loop error: {exc}")
            import traceback
            traceback.print_exc()
        # Sleep until the start of the NEXT minute, not a flat 60s from now —
        # otherwise the loop's tick offset drifts away from wall-clock minute
        # boundaries and a schedule due at HH:MM:00 can sit unnoticed for up
        # to 59s depending on when the loop happened to start.
        time.sleep(_seconds_until_next_minute())