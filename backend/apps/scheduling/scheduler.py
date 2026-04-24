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
    logger.debug("[SCHEDULER] Tick at %s", now.strftime("%H:%M"))

    # NOTE: "etl__group" does NOT exist — ETL uses allowed_groups (ManyToMany).
    # Use prefetch_related for the M2M; select_related only for FK fields.
    due = [
        s for s in ETLSchedule.objects.select_related(
            "etl", "etl__created_by"
        ).prefetch_related(
            "etl__allowed_groups", "etl__allowed_groups__members"
        ).filter(is_active=True)
        if s.due_today_at(now)
    ]

    if not due:
        return

    for schedule in due:
        # Guard: don't double-fire within the same minute
        if schedule.last_triggered_at:
            lt = timezone.localtime(schedule.last_triggered_at)
            if (lt.date() == now.date()
                    and lt.hour == now.hour
                    and lt.minute == now.minute):
                logger.debug(
                    "[SCHEDULER] Already fired '%s' this minute — skip",
                    schedule.etl.name,
                )
                continue

        etl = schedule.etl
        logger.info("[SCHEDULER] Firing '%s' (%s)", etl.name, schedule.frequency)

        # 1. Create PENDING execution
        execution = Execution.objects.create(
            etl=etl,
            launched_by=etl.created_by,
            status="PENDING",
            execution_config=dict(etl.config),
            execution_label=f"{etl.name} — scheduled {now.strftime('%Y-%m-%d')}",
        )

        # 2. Send emails + in-app notifications
        _send_schedule_notifications(schedule, execution, now)

        # 3. Stamp
        schedule.last_triggered_at = now
        schedule.save(update_fields=["last_triggered_at"])

        logger.info(
            "[SCHEDULER] ✓ Execution %s created for '%s'",
            execution.id,
            etl.name,
        )


def _send_schedule_notifications(schedule, execution, now: datetime) -> None:
    """
    Send launch-reminder emails + in-app notifications to:
      - The designated recipients (creator / group / specific email)
      - Any backup email
      - Every admin (always, for audit purposes)
    """
    etl = schedule.etl

    # ── 1. Email notifications ────────────────────────────────────────────────
    for addr in schedule.all_notify_emails:
        try:
            _send_schedule_email(schedule, execution, addr, now)
        except Exception as e:
            logger.warning(
                "[SCHEDULER] Email to %s failed for '%s': %s", addr, etl.name, e
            )

    if not schedule.all_notify_emails:
        logger.warning(
            "[SCHEDULER] No notify emails for schedule %s", schedule.id
        )

    # ── 2. In-app notifications ───────────────────────────────────────────────
    _create_inapp_notifications(schedule, execution)


def _create_inapp_notifications(schedule, execution) -> None:
    try:
        from django.contrib.auth import get_user_model
        from ..notification.models import Notification

        etl = schedule.etl
        creator = etl.created_by

        msg = (
            f"A scheduled {schedule.frequency} run for \"{etl.name}\" is due. "
            "Please review the configuration and launch it from the Executions tab."
        )

        # Always notify the ETL creator
        Notification.objects.create(
            user=creator,
            title=f"⏰ Scheduled run ready: {etl.name}",
            message=msg,
            notification_type="info",
            execution=execution,
        )

        # If group-notify: notify every active group member individually.
        # ETL uses allowed_groups (ManyToMany), so iterate over all of them.
        if schedule.notify_target == "group":
            for group in etl.allowed_groups.all():
                members = group.members.filter(is_active=True).exclude(id=creator.id)
                for member in members:
                    Notification.objects.create(
                        user=member,
                        title=f"⏰ Scheduled run ready: {etl.name}",
                        message=msg,
                        notification_type="info",
                        execution=execution,
                    )

        # Always notify all admins (audit trail)
        User = get_user_model()
        admins = User.objects.filter(
            is_admin=True, is_active=True
        ).exclude(id=creator.id)
        for admin in admins:
            Notification.objects.create(
                user=admin,
                title=f"📅 Scheduled run triggered: {etl.name}",
                message=(
                    f"Scheduler auto-created a PENDING execution for \"{etl.name}\" "
                    f"(owned by {creator.username}). "
                    f"Schedule: {schedule.frequency} at "
                    f"{schedule.time_of_day.strftime('%H:%M')}."
                ),
                notification_type="info",
                execution=execution,
            )

    except Exception as e:
        logger.warning("[SCHEDULER] In-app notification error: %s", e)


def _send_schedule_email(
    schedule, execution, recipient: str, now: datetime
) -> None:
    from django.core.mail import EmailMultiAlternatives

    etl = schedule.etl
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    deep_link = f"{frontend_url}?tab=executions&exec={execution.id}"

    freq_label = {
        "daily": "daily",
        "weekly": (
            f"weekly (every "
            f"{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][schedule.day_of_week or 0]})"
        ),
        "monthly": f"monthly (day {schedule.day_of_month})",
    }.get(schedule.frequency, schedule.frequency)

    subject = f"⏰ Scheduled ETL ready to launch: {etl.name}"

    text_body = f"""Hi,

Your {freq_label} schedule for "{etl.name}" (v{etl.version}) is due today \
({now.strftime('%Y-%m-%d %H:%M')}).

Steps:
  1. Open the platform → Executions tab
  2. Find the pending run: "{execution.execution_label}"
  3. Review & update the config (input file paths may have changed)
  4. Click Launch

Quick link: {deep_link}

ETL: {etl.name} v{etl.version}
Schedule: {freq_label} at {schedule.time_of_day.strftime('%H:%M')}

──
ETL Platform""".strip()

    html_body = _build_schedule_html(
        etl, execution, freq_label, deep_link, now, schedule
    )

    from_email = getattr(
        settings, "DEFAULT_FROM_EMAIL", "noreply@etl-platform.local"
    )
    msg = EmailMultiAlternatives(subject, text_body, from_email, [recipient])
    msg.attach_alternative(html_body, "text/html")
    msg.send()
    logger.info(
        "[SCHEDULER] Email sent to %s for '%s'", recipient, etl.name
    )


def _build_schedule_html(
    etl, execution, freq_label, deep_link, now, schedule
) -> str:
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
        changed.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                  padding:16px;margin-bottom:20px;">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.06em;color:#94a3b8;margin:0 0 12px;">
          What to do
        </p>
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