

import logging
from datetime import datetime, timezone as _tz

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("scheduling")


def check_and_fire_schedules() -> None:
    """Entry point called by the polling thread every 60 seconds."""
    try:
        _do_check()
    except Exception as exc:
        logger.error("[SCHEDULER] Unhandled error: %s", exc, exc_info=True)


def _do_check() -> None:
    from .models import ETLSchedule
    from ..execution.models import Execution

    now = timezone.localtime()          # server local time
    logger.debug("[SCHEDULER] Tick at %s", now.strftime("%H:%M"))

    due = [s for s in ETLSchedule.objects.select_related("etl", "etl__created_by").filter(is_active=True)
           if s.due_today_at(now)]

    if not due:
        return

    for schedule in due:
        # Guard: skip if we already fired within this calendar minute
        if schedule.last_triggered_at:
            lt = timezone.localtime(schedule.last_triggered_at)
            if lt.date() == now.date() and lt.hour == now.hour and lt.minute == now.minute:
                logger.debug("[SCHEDULER] Already fired %s this minute — skipping", schedule.etl.name)
                continue

        etl = schedule.etl
        logger.info("[SCHEDULER] Firing schedule for ETL '%s' (%s)", etl.name, schedule.frequency)

        # ── 1. Create a PENDING Execution ────────────────────────────
        execution = Execution.objects.create(
            etl=etl,
            launched_by=etl.created_by,
            status="PENDING",
            execution_config=dict(etl.config),
            execution_label=f"{etl.name} — scheduled {now.strftime('%Y-%m-%d')}",
        )

        # ── 2. Send email ─────────────────────────────────────────────
        recipient = schedule.effective_email
        if recipient:
            try:
                _send_schedule_email(schedule, execution, recipient, now)
            except Exception as e:
                logger.warning("[SCHEDULER] Email failed for %s: %s", etl.name, e)
        else:
            logger.warning("[SCHEDULER] No email for schedule %s — skipping email", schedule.id)

        # ── 3. In-app Notification ────────────────────────────────────
        try:
            from ..notification.models import Notification
            Notification.objects.create(
                user=etl.created_by,
                title=f"⏰ Scheduled run ready: {etl.name}",
                message=(
                    f"A scheduled {schedule.frequency} run for \"{etl.name}\" is due. "
                    f"Please review the configuration and launch it from the Executions tab."
                ),
                notification_type="info",
                execution=execution,
            )
        except Exception as e:
            logger.warning("[SCHEDULER] Notification failed: %s", e)

        # ── 4. Stamp last_triggered_at ────────────────────────────────
        schedule.last_triggered_at = now
        schedule.save(update_fields=["last_triggered_at"])

        logger.info("[SCHEDULER] ✓ Execution %s created for ETL '%s'", execution.id, etl.name)


def _send_schedule_email(schedule, execution, recipient: str, now: datetime) -> None:
    from django.core.mail import EmailMultiAlternatives

    etl = schedule.etl
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    deep_link = f"{frontend_url}?tab=executions&exec={execution.id}"

    freq_label = {
        "daily":   "daily",
        "weekly":  f"weekly (every {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][schedule.day_of_week or 0]})",
        "monthly": f"monthly (day {schedule.day_of_month})",
    }.get(schedule.frequency, schedule.frequency)

    subject = f"⏰ Scheduled ETL ready to launch: {etl.name}"

    text_body = f"""
Hi,

Your {freq_label} schedule for "{etl.name}" (v{etl.version}) is due today ({now.strftime('%Y-%m-%d %H:%M')}).

A pending execution has been created for you. Before launching, please:
  1. Open the platform and go to the Executions tab.
  2. Find the pending run "{execution.execution_label}".
  3. Review and update the config (especially input file paths — these may have changed since the last run).
  4. Click Launch when ready.

Quick link: {deep_link}

ETL: {etl.name} v{etl.version}
Schedule: {freq_label} at {schedule.time_of_day.strftime('%H:%M')}

──
ETL Platform
""".strip()

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px;color:#1e293b;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

    <div style="padding:24px;background:#eff6ff;border-bottom:1px solid #93c5fd;">
      <span style="display:inline-block;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600;background:#2563eb;color:#fff;margin-bottom:10px;">⏰ Scheduled Run Due</span>
      <p style="font-size:20px;font-weight:700;margin:0 0 4px;color:#0f172a;">{etl.name}</p>
      <p style="font-size:13px;color:#64748b;margin:0;">{freq_label} · {now.strftime('%A, %d %B %Y at %H:%M')}</p>
    </div>

    <div style="padding:24px;">
      <p style="font-size:14px;color:#334155;margin:0 0 20px;line-height:1.6;">
        Your scheduled run for <strong>{etl.name}</strong> is ready to launch.
        Before you do, please <strong>review and update the configuration</strong> —
        input file paths and data sources may have changed since the last run.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:0 0 10px;">What to do</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          {''.join(f'<div style="display:flex;gap:10px;align-items:flex-start;"><span style="width:20px;height:20px;border-radius:50%;background:#2563eb;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">{i+1}</span><span style="font-size:13px;color:#475569;">{step}</span></div>' for i, step in enumerate(["Open the Executions tab in the platform", "Find the pending run labeled <strong>" + execution.execution_label + "</strong>", "Update input paths if your data files have changed", "Click <strong>Launch</strong> when ready"]))}
        </div>
      </div>

      <a href="{deep_link}"
         style="display:block;padding:14px;background:#2563eb;color:#fff;text-align:center;
                text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Open Platform → Review &amp; Launch
      </a>

      <p style="font-size:11px;color:#94a3b8;margin:16px 0 0;text-align:center;">
        Execution ID: {execution.id}
      </p>
    </div>

    <div style="padding:14px 24px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #f1f5f9;">
      ETL Platform · Scheduled {freq_label} at {schedule.time_of_day.strftime('%H:%M')}
    </div>
  </div>
</body>
</html>"""

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@etl-platform.local")
    msg = EmailMultiAlternatives(subject, text_body, from_email, [recipient])
    msg.attach_alternative(html_body, "text/html")
    msg.send()
    logger.info("[SCHEDULER] Email sent to %s for ETL '%s'", recipient, etl.name)