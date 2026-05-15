# scheduling/scheduler.py
import logging
from datetime import datetime

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("scheduling")


def _is_admin(user) -> bool:
    return getattr(user, "role", None) == "admin"


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

    due = [
        s for s in ETLSchedule.objects.select_related(
            "etl", "etl__created_by", "launched_for"
        ).prefetch_related(
            "etl__allowed_groups", "etl__allowed_groups__members"
        ).filter(is_active=True)
        if s.due_today_at(now)
    ]

    if not due:
        return

    for schedule in due:
        if schedule.last_triggered_at:
            lt = timezone.localtime(schedule.last_triggered_at)
            if (lt.date() == now.date()
                    and lt.hour == now.hour
                    and lt.minute == now.minute):
                continue

        etl = schedule.etl
        creator = etl.created_by

        # The execution is always owned by the creator (or launched_for if specific)
        # For group: owned by creator, but all group members get notified
        if schedule.notify_target == "specific" and schedule.launched_for:
            launch_owner = schedule.launched_for
        else:
            launch_owner = creator

        execution = Execution.objects.create(
            etl=etl,
            launched_by=launch_owner,
            status="PENDING",
            execution_config=dict(etl.config),
            execution_label=f"{etl.name} — scheduled {now.strftime('%Y-%m-%d')}",
        )

        logger.info(
            "[SCHEDULER] ✓ Execution %s created for '%s' (owner: %s)",
            execution.id, etl.name, launch_owner.username,
        )

        _send_schedule_notifications(schedule, execution, now)

        schedule.last_triggered_at = now
        schedule.save(update_fields=["last_triggered_at"])


def _get_launch_user_ids(schedule) -> set:
    """
    Returns the set of user IDs who should see the launch button
    and receive the in-app notification.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()
    etl = schedule.etl
    creator = etl.created_by
    ids: set = set()

    if not _is_admin(creator):
        # Regular user created this schedule — only they launch it
        ids.add(creator.id)
        return ids

    # Admin-created schedule
    if schedule.notify_target == "group":
        for group in etl.allowed_groups.all():
            for member in group.members.filter(is_active=True):
                ids.add(member.id)
    elif schedule.notify_target == "specific":
        if schedule.launched_for_id:
            ids.add(schedule.launched_for_id)
        else:
            ids.add(creator.id)
    else:
        # "creator" target — admin sees it themselves
        ids.add(creator.id)

    return ids


def _send_schedule_notifications(schedule, execution, now: datetime) -> None:
    etl = schedule.etl

    for addr in schedule.all_notify_emails:
        try:
            _send_schedule_email(schedule, execution, addr, now)
        except Exception as e:
            logger.warning(
                "[SCHEDULER] Email to %s failed for '%s': %s", addr, etl.name, e
            )

    _create_inapp_notifications(schedule, execution)


def _create_inapp_notifications(schedule, execution) -> None:
    try:
        from django.contrib.auth import get_user_model
        from ..notification.models import Notification

        etl     = schedule.etl
        User    = get_user_model()
        creator = etl.created_by

        launch_msg = (
            f"A scheduled {schedule.frequency} run for \"{etl.name}\" is ready. "
            "Please review the configuration and launch it from the Executions tab."
        )
        audit_msg = (
            f"Scheduler auto-created a PENDING execution for \"{etl.name}\" "
            f"(owned by {creator.username}). "
            f"Schedule: {schedule.frequency} at "
            f"{schedule.time_of_day.strftime('%H:%M')}."
        )

        launch_user_ids = _get_launch_user_ids(schedule)

        admin_ids = set(
            User.objects.filter(role="admin", is_active=True)
            .values_list("id", flat=True)
        )

        # Send launch notification to each assigned non-admin user
        for uid in launch_user_ids:
            if uid in admin_ids:
                continue
            try:
                user = User.objects.get(pk=uid)
                Notification.objects.create(
                    user=user,
                    title=f"⏰ Scheduled run ready: {etl.name}",
                    message=launch_msg,
                    notification_type="info",
                    execution=execution,
                )
            except User.DoesNotExist:
                pass

        # If the creator is an admin and target is "creator", notify them too
        if _is_admin(creator) and schedule.notify_target == "creator":
            Notification.objects.create(
                user=creator,
                title=f"⏰ Scheduled run ready: {etl.name}",
                message=launch_msg,
                notification_type="info",
                execution=execution,
            )

        # Audit notification for ALL admins regardless
        for admin in User.objects.filter(role="admin", is_active=True):
            Notification.objects.create(
                user=admin,
                title=f"📅 Scheduled run triggered: {etl.name}",
                message=audit_msg,
                notification_type="info",
                execution=execution,
            )

    except Exception as e:
        logger.warning("[SCHEDULER] In-app notification error: %s", e)


def _send_schedule_email(schedule, execution, recipient: str, now: datetime) -> None:
    from django.core.mail import EmailMultiAlternatives

    etl          = schedule.etl
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    deep_link    = f"{frontend_url}?tab=executions&exec={execution.id}"
    freq_label   = _freq_label(schedule)

    subject   = f"⏰ Scheduled ETL ready to launch: {etl.name}"
    text_body = (
        f"Hi,\n\n"
        f'Your {freq_label} schedule for "{etl.name}" (v{etl.version}) is due today '
        f"({now.strftime('%Y-%m-%d %H:%M')}).\n\n"
        f"Steps:\n"
        f"  1. Open the platform → Executions tab\n"
        f'  2. Find the pending run: "{execution.execution_label}"\n'
        f"  3. Review & update the config (input file paths may have changed)\n"
        f"  4. Click Launch\n\n"
        f"Quick link: {deep_link}\n\n"
        f"──\nETL Platform"
    )
    html_body  = _build_schedule_html(etl, execution, freq_label, deep_link, now, schedule)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@etl-platform.local")

    msg = EmailMultiAlternatives(subject, text_body, from_email, [recipient])
    msg.attach_alternative(html_body, "text/html")
    msg.send()
    logger.info("[SCHEDULER] Email sent to %s for '%s'", recipient, etl.name)


def _freq_label(schedule) -> str:
    DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    if schedule.frequency == "weekly":
        return f"weekly (every {DAYS[schedule.day_of_week or 0]})"
    if schedule.frequency == "monthly":
        return f"monthly (day {schedule.day_of_month})"
    if schedule.frequency == "yearly":
        mon = MONTHS[(schedule.month_of_year or 1) - 1]
        return f"yearly ({mon} {schedule.day_of_year})"
    return "daily"


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
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#f8fafc;margin:0;padding:20px;color:#1e293b;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;
              overflow:hidden;border:1px solid #e2e8f0;">
    <div style="padding:24px;background:#eff6ff;border-bottom:1px solid #93c5fd;">
      <span style="display:inline-block;padding:4px 12px;border-radius:99px;
                   font-size:12px;font-weight:600;background:#2563eb;color:#fff;
                   margin-bottom:10px;">⏰ Scheduled Run Due</span>
      <p style="font-size:20px;font-weight:700;margin:0 0 4px;">{etl.name}</p>
      <p style="font-size:13px;color:#64748b;margin:0;">
        {freq_label} · {now.strftime('%A, %d %B %Y at %H:%M')}
      </p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:14px;color:#334155;margin:0 0 20px;line-height:1.6;">
        Your scheduled run for <strong>{etl.name}</strong> is due.
        Before launching, please <strong>review the configuration</strong>.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                  padding:16px;margin-bottom:20px;">
        {steps_html}
      </div>
      <a href="{deep_link}"
         style="display:block;padding:14px;background:#2563eb;color:#fff;
                text-align:center;text-decoration:none;border-radius:8px;
                font-weight:600;font-size:14px;">
        Open Platform → Review &amp; Launch
      </a>
    </div>
  </div>
</body></html>"""