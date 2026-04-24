
import uuid
from django.db import models
from django.conf import settings


class ETLSchedule(models.Model):
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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    etl = models.OneToOneField(
        "etl.ETL",
        on_delete=models.CASCADE,
        related_name="schedule",
    )

    is_active = models.BooleanField(default=True)

    frequency   = models.CharField(max_length=10, choices=FREQ_CHOICES, default="daily")
    time_of_day = models.TimeField(help_text="Local server time to trigger (HH:MM)")

    # weekly only
    day_of_week  = models.IntegerField(null=True, blank=True, choices=DAY_CHOICES)
    # monthly only
    day_of_month = models.IntegerField(null=True, blank=True)  # 1-28

    # Who gets the "please review & launch" email.
    # Falls back to the ETL creator's email if blank.
    notify_email = models.EmailField(
        blank=True,
        help_text="Email to notify when a scheduled run is due. "
                  "Defaults to the ETL creator's email.",
    )

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    # Track the last time this schedule fired so we don't double-fire
    last_triggered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "scheduling"
        db_table  = "etl_schedules"

    def __str__(self):
        return f"Schedule({self.etl.name}, {self.frequency})"

    @property
    def effective_email(self) -> str:
        return self.notify_email or self.etl.created_by.email or ""

    def due_today_at(self, now) -> bool:
        """Return True if this schedule should fire at `now` (datetime)."""
        if not self.is_active:
            return False

        t = self.time_of_day
        # Allow a ±1-minute window so the polling loop never misses the slot
        minute_match = (
            now.hour   == t.hour
            and now.minute == t.minute
        )
        if not minute_match:
            return False

        if self.frequency == "daily":
            return True
        if self.frequency == "weekly":
            return self.day_of_week is not None and now.weekday() == self.day_of_week
        if self.frequency == "monthly":
            return self.day_of_month is not None and now.day == self.day_of_month
        return False