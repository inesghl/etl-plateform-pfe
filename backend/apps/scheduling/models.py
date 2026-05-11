# scheduling/models.py  — full replacement
# Key additions:
#   - "yearly" frequency with month_of_year + day_of_year fields
#   - launched_for FK: the user who should see and launch the pending execution
#   - due_today_at() handles yearly check
#   - all_notify_emails / effective_email updated

from django.db import models
from django.conf import settings


FREQUENCY_CHOICES = [
    ("daily",   "Daily"),
    ("weekly",  "Weekly"),
    ("monthly", "Monthly"),
    ("yearly",  "Yearly"),
]

NOTIFY_TARGET_CHOICES = [
    ("creator",  "ETL creator only"),
    ("group",    "Entire group"),
    ("specific", "Specific email"),
]

DAY_OF_WEEK_CHOICES = [(i, d) for i, d in enumerate(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
)]


class ETLSchedule(models.Model):

    etl = models.ForeignKey(
        "etl.ETL",
        on_delete=models.CASCADE,
        related_name="schedules",
    )

    # ── timing ────────────────────────────────────────────────────────────────
    frequency    = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default="daily")
    time_of_day  = models.TimeField(help_text="Local server time to fire")

    # weekly
    day_of_week  = models.IntegerField(null=True, blank=True, choices=DAY_OF_WEEK_CHOICES)

    # monthly
    day_of_month = models.IntegerField(null=True, blank=True)

    # yearly  (month 1-12, day 1-28 for safety)
    month_of_year = models.IntegerField(null=True, blank=True,
                                        help_text="1=Jan … 12=Dec (yearly only)")
    day_of_year   = models.IntegerField(null=True, blank=True,
                                        help_text="Day of month for yearly schedule (1-28)")

    is_active = models.BooleanField(default=True)

    # ── notification target ───────────────────────────────────────────────────
    notify_target        = models.CharField(
        max_length=20, choices=NOTIFY_TARGET_CHOICES, default="creator"
    )
    notify_specific_email = models.EmailField(blank=True, default="")
    backup_email          = models.EmailField(blank=True, default="")

    # The specific user who should receive the "launch" prompt.
    # Set automatically from notify_target when the schedule fires.
    # NULL = ETL creator.
    launched_for = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_scheduled_executions",
        help_text="User who should see and launch the pending execution. "
                  "NULL means the ETL creator.",
    )

    # ── timestamps ────────────────────────────────────────────────────────────
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.etl.name} [{self.frequency}]"

    # ── helpers ───────────────────────────────────────────────────────────────

    @property
    def effective_email(self) -> str:
        """Primary notification address (single string, for display)."""
        if self.notify_target == "specific" and self.notify_specific_email:
            return self.notify_specific_email
        return self.etl.created_by.email

    @property
    def all_notify_emails(self) -> list[str]:
        """All addresses that should receive the schedule email."""
        addrs: set[str] = set()

        if self.notify_target == "specific" and self.notify_specific_email:
            addrs.add(self.notify_specific_email)
        elif self.notify_target == "group":
            for group in self.etl.allowed_groups.all():
                for member in group.members.filter(is_active=True):
                    if member.email:
                        addrs.add(member.email)
        else:
            # "creator"
            if self.etl.created_by.email:
                addrs.add(self.etl.created_by.email)

        if self.backup_email:
            addrs.add(self.backup_email)

        return list(addrs)

    def due_today_at(self, now) -> bool:
        """Return True if this schedule should fire at *now*."""
        # Time window: same hour + minute
        if self.time_of_day.hour != now.hour or self.time_of_day.minute != now.minute:
            return False

        if self.frequency == "daily":
            return True

        if self.frequency == "weekly":
            # weekday(): Monday=0
            return now.weekday() == (self.day_of_week or 0)

        if self.frequency == "monthly":
            return now.day == (self.day_of_month or 1)

        if self.frequency == "yearly":
            return (
                now.month == (self.month_of_year or 1)
                and now.day == (self.day_of_year or 1)
            )

        return False