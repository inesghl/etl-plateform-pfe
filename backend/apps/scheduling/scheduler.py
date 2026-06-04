# scheduling/scheduler.py
import logging
from datetime import datetime

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("scheduling")


def check_and_fire_schedules() -> None:
    try:
        _do_check()
    except Exception as exc:
        logger.error("[SCHEDULER] Unhandled error: %s", exc, exc_info=True)


def _do_check() -> None:
    from .models import ETLSchedule
    from ..execution.models import Execution

    now = timezone.localtime()
    print(f"[SCHEDULER] tick — server local time: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")

    all_active = list(
        ETLSchedule.objects.select_related("etl", "etl__created_by")
        .prefetch_related("etl__allowed_groups", "etl__allowed_groups__members")
        .filter(is_active=True)
    )

    if not all_active:
        print("[SCHEDULER] no active schedules in DB")
        return

    for s in all_active:
        due = s.due_today_at(now)
        lt_str = timezone.localtime(s.last_triggered_at).strftime('%H:%M:%S') if s.last_triggered_at else "never"
        print(f"[SCHEDULER]   '{s.etl.name}' | scheduled={s.time_of_day} | due={due} | last_triggered={lt_str}")

    due_list = [s for s in all_active if s.due_today_at(now)]

    if not due_list:
        print("[SCHEDULER] nothing due this tick")
        return

    for schedule in due_list:
        etl = schedule.etl
        print(f"[SCHEDULER] 🚀 FIRING '{etl.name}'")

        execution = Execution.objects.create(
            etl=etl,
            launched_by=None,
            status="PENDING",
            execution_config=dict(etl.config),
            execution_label=f"{etl.name} — scheduled {now.strftime('%Y-%m-%d')}",
        )

        _send_schedule_notifications(schedule, execution, now)

        schedule.last_triggered_at = now
        schedule.save(update_fields=["last_triggered_at"])

        print(f"[SCHEDULER] ✓ Execution {execution.id} created for '{etl.name}'")


def _send_schedule_notifications(schedule, execution, now: datetime) -> None:
    etl = schedule.etl

    email_recipients: set[str] = set(schedule.all_notify_emails)

    # Always include creator
    if etl.created_by.email:
        email_recipients.add(etl.created_by.email)

    # Also include all active group members who have access to this ETL
    for group in etl.allowed_groups.all():
        for member in group.members.filter(is_active=True):
            if member.email:
                email_recipients.add(member.email)

    if not email_recipients:
        logger.warning("[SCHEDULER] No notify emails for schedule %s", schedule.id)
    else:
        for addr in email_recipients:
            try:
                _send_schedule_email(schedule, execution, addr, now)
            except Exception as e:
                logger.warning(
                    "[SCHEDULER] Email to %s failed for '%s': %s", addr, etl.name, e
                )

    _create_inapp_notifications(schedule, execution)

def _create_inapp_notifications(schedule, execution) -> None:
    """
    In-app notifications when a scheduled run fires.
    Notifies (once each): ETL creator + group members + individually allowed users.
    No separate admin flood — an admin only gets notified if they're the
    creator or a group member.
    """
    try:
        from ..notification.models import Notification

        etl     = schedule.etl
        creator = etl.created_by
        message = (
            f"Your {schedule.frequency} scheduled run for \"{etl.name}\" is ready. "
            "Go to the Executions tab, review the config, and click Launch."
        )

        notified_ids: set = set()

        def _notify(user):
            if not user or user.id in notified_ids:
                return
            Notification.objects.create(
                user=user,
                title=f"⏰ Scheduled run ready: {etl.name}",
                message=message,
                notification_type="info",
                execution=execution,
            )
            notified_ids.add(user.id)

        _notify(creator)

        for group in etl.allowed_groups.prefetch_related("members").all():
            for member in group.members.filter(is_active=True):
                _notify(member)

        for user in etl.allowed_users.filter(is_active=True):
            _notify(user)

    except Exception as e:
        logger.warning("[SCHEDULER] In-app notification error: %s", e, exc_info=True)

def _send_schedule_email(schedule, execution, recipient: str, now: datetime) -> None:
    from django.core.mail import EmailMultiAlternatives

    etl          = schedule.etl
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    deep_link    = f"{frontend_url}?tab=executions&exec={execution.id}"

    _DAYS_SHORT   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    _MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    freq_label = {
        "daily":   "daily",
        "weekly":  f"weekly (every {_DAYS_SHORT[schedule.day_of_week or 0]})",
        "monthly": f"monthly (day {schedule.day_of_month})",
        "yearly":  (
            f"yearly ({_MONTHS_SHORT[(schedule.month_of_year or 1) - 1]}"
            f" {schedule.day_of_month})"
        ),
    }.get(schedule.frequency, schedule.frequency)

    subject = f"⏰ Scheduled ETL ready to launch: {etl.name}"
    text_body = (
        f"Hi,\n\n"
        f"Your {freq_label} schedule for \"{etl.name}\" (v{etl.version}) is due today "
        f"({now.strftime('%Y-%m-%d %H:%M')}).\n\n"
        f"Steps:\n"
        f"  1. Open the platform → Executions tab\n"
        f"  2. Find the pending run: \"{execution.execution_label}\"\n"
        f"  3. Review & update the config (input file paths may have changed)\n"
        f"  4. Click Launch\n\n"
        f"Quick link: {deep_link}\n\n"
        f"ETL: {etl.name} v{etl.version}\n"
        f"Schedule: {freq_label} at {schedule.time_of_day.strftime('%H:%M')}\n\n"
        f"──\nETL Platform"
    )

    html_body  = _build_schedule_html(etl, execution, freq_label, deep_link, now, schedule)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@etl-platform.local")

    msg = EmailMultiAlternatives(subject, text_body, from_email, [recipient])
    msg.attach_alternative(html_body, "text/html")
    msg.send()
    logger.info("[SCHEDULER] Email sent to %s for '%s'", recipient, etl.name)


def _build_schedule_html(etl, execution, freq_label, deep_link, now, schedule) -> str:
    steps = [
        "Open the <strong>Executions</strong> tab in the platform",
        f"Find the pending run: <strong>{execution.execution_label}</strong>",
        "Update input file paths if your data has changed",
        "Click <strong>Launch</strong> when ready",
    ]
    steps_html = "".join(
        f'<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;">'
        f'<span style="min-width:22px;height:22px;border-radius:50%;background:#2563eb;'
        f'color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;'
        f'justify-content:center;">{i + 1}</span>'
        f'<span style="font-size:13px;color:#475569;line-height:1.5;">{s}</span></div>'
        for i, s in enumerate(steps)
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#f8fafc;margin:0;padding:20px;color:#1e293b;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;
              overflow:hidden;border:1px solid #e2e8f0;">
    <div style="padding:24px;background:#eff6ff;border-bottom:1px solid #93c5fd;">
      <span style="display:inline-block;padding:4px 12px;border-radius:99px;
                   font-size:12px;font-weight:600;background:#2563eb;color:#fff;
                   margin-bottom:10px;">⏰ Scheduled Run Due</span>
      <p style="font-size:20px;font-weight:700;margin:0 0 4px;color:#0f172a;">
        {etl.name}
      </p>
      <p style="font-size:13px;color:#64748b;margin:0;">
        {freq_label} · {now.strftime('%A, %d %B %Y at %H:%M')}
      </p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:14px;color:#334155;margin:0 0 20px;line-height:1.6;">
        Your scheduled run for <strong>{etl.name}</strong> is due. Before launching,
        please <strong>review the configuration</strong> — input file paths may have
        changed since the last run.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                  padding:16px;margin-bottom:20px;">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.06em;color:#94a3b8;margin:0 0 12px;">What to do</p>
        {steps_html}
      </div>
      <a href="{deep_link}"
         style="display:block;padding:14px;background:#2563eb;color:#fff;
                text-align:center;text-decoration:none;border-radius:8px;
                font-weight:600;font-size:14px;">
        Open Platform → Review &amp; Launch
      </a>
      <p style="font-size:11px;color:#94a3b8;margin:16px 0 0;text-align:center;">
        Execution ID: {execution.id}
      </p>
    </div>
    <div style="padding:14px 24px;font-size:11px;color:#94a3b8;text-align:center;
                border-top:1px solid #f1f5f9;">
      ETL Platform · {freq_label} at {schedule.time_of_day.strftime('%H:%M')}
    </div>
  </div>
</body>
</html>"""