import uuid
from django.db import models


FREQ_CHOICES = [
    ("daily",   "Daily"),
    ("weekly",  "Weekly"),
    ("monthly", "Monthly"),
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
    day_of_week  = models.IntegerField(null=True, blank=True, choices=DAY_CHOICES)
    # monthly only
    day_of_month = models.IntegerField(null=True, blank=True)  # 1–28

    # ── Notification target (admin-only fields) ──────────────────────────────
    notify_target = models.CharField(
        max_length=10,
        choices=NOTIFY_TARGET_CHOICES,
        default="creator",
        help_text="Admin-only: who should receive the launch notification.",
    )
    # Used when notify_target == "specific"
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
        # "creator" or "group" — always start with the creator's email
        return self.etl.created_by.email or ""

    @property
    def effective_email(self) -> str:
        """Backwards-compat alias used in the scheduler."""
        return self.primary_email

    # ── Group notify: collect all member emails ──────────────────────────────
    @property
    def group_emails(self) -> list[str]:
        """
        When notify_target == "group", return every active member email
        across all groups the ETL belongs to (ETL.allowed_groups is M2M).
        Falls back to just the creator's email if no groups are assigned.
        """
        if self.notify_target != "group":
            return []

        etl = self.etl
        # allowed_groups is the ManyToManyField on the ETL model.
        # We iterate all assigned groups and collect unique member emails.
        emails: set[str] = set()
        for group in etl.allowed_groups.all():
            member_emails = group.members.filter(
                is_active=True
            ).values_list("email", flat=True)
            emails.update(e for e in member_emails if e)

        if not emails:
            # No groups assigned — fall back to creator
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

    # ── Due check ────────────────────────────────────────────────────────────
    def due_today_at(self, now) -> bool:
        if not self.is_active:
            return False
        t = self.time_of_day
        if not (now.hour == t.hour and now.minute == t.minute):
            return False
        if self.frequency == "daily":
            return True
        if self.frequency == "weekly":
            return (
                self.day_of_week is not None
                and now.weekday() == self.day_of_week
            )
        if self.frequency == "monthly":
            return (
                self.day_of_month is not None
                and now.day == self.day_of_month
            )
        return False