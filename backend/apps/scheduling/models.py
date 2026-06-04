import uuid
import calendar

from django.conf import settings
from django.db import models


FREQ_CHOICES = [
    ("daily",   "Daily"),
    ("weekly",  "Weekly"),
    ("monthly", "Monthly"),
    ("yearly",  "Yearly"),
]

MONTH_CHOICES = [
    (1, "January"), (2, "February"), (3, "March"), (4, "April"),
    (5, "May"), (6, "June"), (7, "July"), (8, "August"),
    (9, "September"), (10, "October"), (11, "November"), (12, "December"),
]

DAY_CHOICES = [
    (0, "Monday"),
    (1, "Tuesday"),
    (2, "Wednesday"),
    (3, "Thursday"),
    (4, "Friday"),
    (5, "Saturday"),
    (6, "Sunday"),
]

NOTIFY_TARGET_CHOICES = [
    ("creator",  "ETL creator only"),
    ("group",    "Entire group"),
    ("specific", "Specific email"),
]


class ETLSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    etl = models.OneToOneField(
        "etl.ETL",
        on_delete=models.CASCADE,
        related_name="schedule",
    )

    is_active = models.BooleanField(default=True)

    frequency   = models.CharField(max_length=10, choices=FREQ_CHOICES, default="daily")
    time_of_day = models.TimeField(help_text="Server local time to trigger (HH:MM)")

    # weekly only
    day_of_week = models.IntegerField(null=True, blank=True, choices=DAY_CHOICES)

    # monthly + yearly: 1–31, clamped to month length at runtime
    # Use 28 to guarantee firing every month including February.
    day_of_month = models.IntegerField(
        null=True, blank=True,
        help_text="1–31. Days beyond month length clamp to the last day (e.g. 31 → 30 in April).",
    )

    # yearly only
    month_of_year = models.IntegerField(
        null=True, blank=True,
        choices=MONTH_CHOICES,
    )

    # ── Notification target (admin-only fields) ──────────────────────────────
    notify_target = models.CharField(
        max_length=10,
        choices=NOTIFY_TARGET_CHOICES,
        default="creator",
        help_text="Admin-only: who should receive the launch notification.",
    )
    notify_specific_email = models.EmailField(
        blank=True,
        help_text="Admin-only: a specific email to notify (overrides creator).",
    )

    # ── Backup / extra email (available to all users) ────────────────────────
    backup_email = models.EmailField(
        blank=True,
        help_text="An extra address that always receives a CC of the notification.",
    )

    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "scheduling"
        db_table  = "etl_schedules"

    def __str__(self):
        return f"Schedule({self.etl.name}, {self.frequency})"

    # ── Primary recipient ────────────────────────────────────────────────────
    @property
    def primary_email(self) -> str:
        """The main address the launch notification goes to."""
        if self.notify_target == "specific" and self.notify_specific_email:
            return self.notify_specific_email
        return self.etl.created_by.email or ""

    @property
    def effective_email(self) -> str:
        """Backwards-compat alias used in the scheduler."""
        return self.primary_email

    # ── Group notify ─────────────────────────────────────────────────────────
    @property
    def group_emails(self) -> list[str]:
        """
        When notify_target == "group", return every active member email
        across all groups the ETL belongs to. Falls back to creator email
        if no groups are assigned.
        """
        if self.notify_target != "group":
            return []

        etl = self.etl
        emails: set[str] = set()
        for group in etl.allowed_groups.all():
            member_emails = group.members.filter(
                is_active=True
            ).values_list("email", flat=True)
            emails.update(e for e in member_emails if e)

        if not emails:
            return [self.primary_email]

        return list(emails)

    # ── All addresses that should receive the notification ───────────────────
    @property
    def all_notify_emails(self) -> list[str]:
        """Deduplicated list of everyone who should receive the launch email."""
        addresses: set[str] = set()

        if self.notify_target == "group":
            addresses.update(self.group_emails)
        else:
            addr = self.primary_email
            if addr:
                addresses.add(addr)

        if self.backup_email:
            addresses.add(self.backup_email)

        return list(addresses)

    def _effective_dom(self, now) -> int:
        """
        Clamp day_of_month to the actual last day of `now`'s month.
        dom=28 → fires Feb 28, Mar 28, Apr 28 …
        dom=31 → fires Jan 31, Feb 28, Mar 31, Apr 30 …
        """
        last_day = calendar.monthrange(now.year, now.month)[1]
        return min(self.day_of_month, last_day)

    # ── Due check ────────────────────────────────────────────────────────────
    # ── Due check (catch-up: first poll AT or AFTER the time, once/day) ──
    def due_today_at(self, now) -> bool:
        if not self.is_active:
            return False

        if self.frequency == "weekly":
            if self.day_of_week is None or now.weekday() != self.day_of_week:
                return False
        elif self.frequency == "monthly":
            if self.day_of_month is None or now.day != self._effective_dom(now):
                return False
        elif self.frequency == "yearly":
            if (self.day_of_month is None or self.month_of_year is None
                    or now.month != self.month_of_year
                    or now.day != self._effective_dom(now)):
                return False
        # daily → any day

        t = self.time_of_day
        scheduled_today = now.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
        if now < scheduled_today:
            return False

        if self.last_triggered_at:
            from django.utils import timezone as _tz
            lt = _tz.localtime(self.last_triggered_at)
            if lt >= scheduled_today:
                return False

        return True


# ─────────────────────────────────────────────────────────────
# ScheduleRequest — user asks admin to set up a schedule
# ─────────────────────────────────────────────────────────────

class ScheduleRequest(models.Model):
    STATUS_CHOICES = [
        ("pending",  "Pending review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    SCOPE_CHOICES = [
        ("requester", "Just me"),
        ("group",     "My group"),
        ("specific",  "Specific email"),
    ]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    etl          = models.ForeignKey(
        "etl.ETL", on_delete=models.CASCADE, related_name="schedule_requests"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="schedule_requests",
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")

    # What the user wants
    frequency     = models.CharField(max_length=10, choices=FREQ_CHOICES, default="daily")
    time_of_day   = models.TimeField(help_text="Preferred run time (HH:MM)")
    day_of_week   = models.IntegerField(null=True, blank=True, choices=DAY_CHOICES)
    day_of_month  = models.IntegerField(null=True, blank=True)
    month_of_year = models.IntegerField(null=True, blank=True, choices=MONTH_CHOICES)
    note          = models.TextField(blank=True, help_text="Why do you need this schedule?")

    # Admin decision
    approved_scope        = models.CharField(
        max_length=10, choices=SCOPE_CHOICES, blank=True,
        help_text="Who gets notified when the schedule fires."
    )
    approved_specific_email = models.EmailField(blank=True)
    admin_note            = models.TextField(blank=True)
    reviewed_by           = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reviewed_schedule_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "scheduling"
        db_table  = "etl_schedule_requests"
        ordering  = ["-created_at"]

    def __str__(self):
        return f"ScheduleRequest({self.etl.name}, {self.requested_by}, {self.status})"