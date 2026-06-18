from django.db import models
from django.conf import settings
import uuid


class Execution(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('VALIDATING', 'Validating Inputs'),
        ('VALIDATED', 'Inputs Validated'),
        ('VALIDATION_FAILED', 'Validation Failed'),
        ('INSTALLING_DEPS', 'Installing Dependencies'),
        ('RUNNING', 'Running'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
        ('CANCELLED', 'Cancelled'),
    ]

    OUTPUT_DELIVERY_CHOICES = [
        ('app', 'App only'),
        ('email', 'Email only'),
        ('both', 'App and email'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    etl = models.ForeignKey(
        'etl.ETL', on_delete=models.CASCADE, related_name='executions'
    )
    execution_label = models.CharField(max_length=200, blank=True)
    launched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='launched_executions'
    )

    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='PENDING')

    # Config for this specific run
    execution_config = models.JSONField(
        default=dict, blank=True,
        help_text="Merged config for this run: ETL base config + user overrides"
    )
    config_overrides = models.JSONField(
        default=dict, blank=True,
        help_text="Only the keys the user changed from the ETL default"
    )

    # ── Path classifications ──────────────────────────────────────────
    # User classifies path-like config keys during the launch flow.
    # Stored per-execution so different runs can have different classifications
    # without touching the ETL's global path_classifications.
    # Format: { "input_excel": "input", "output_excel": "output", "logs_dir": "skip" }
    path_classifications = models.JSONField(
        default=dict, blank=True,
        help_text=(
            "User-chosen path classifications for this execution. "
            "Values: 'input', 'output', 'skip'. "
            "Merged over etl.path_classifications at check time."
        )
    )

    # Output delivery preferences
    output_delivery = models.CharField(
        max_length=10, choices=OUTPUT_DELIVERY_CHOICES, default='app'
    )
    notify_email = models.EmailField(blank=True)
    report_sent = models.BooleanField(default=False)
    report_sent_at = models.DateTimeField(null=True, blank=True)

    # File paths
    work_dir = models.CharField(max_length=500, blank=True)
    archive_path = models.CharField(max_length=500, blank=True)

    # Timing
    launched_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Results
    return_code = models.IntegerField(null=True, blank=True)
    stdout_log = models.TextField(blank=True)
    stderr_log = models.TextField(blank=True)
    error_message = models.TextField(blank=True)

    # Runtime details
    runtime_config = models.JSONField(default=dict, blank=True)
    python_version_used = models.CharField(max_length=20, blank=True)
    venv_path = models.CharField(max_length=500, blank=True)
    dependencies_installed = models.BooleanField(default=False)
    dependencies_log = models.TextField(blank=True)

    # Process control — set while the script subprocess is alive, used by cancel
    process_pid = models.IntegerField(null=True, blank=True)
    cancel_requested = models.BooleanField(default=False)

    class Meta:
        app_label = 'execution'
        db_table = 'executions'
        ordering = ['-launched_at']

    def __str__(self):
        return f"{self.etl.name} - {self.launched_at:%Y-%m-%d %H:%M}"

    @property
    def duration_seconds(self):
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None