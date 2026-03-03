from django.db import models
from django.conf import settings
import uuid


class Execution(models.Model):
    """
    Single execution instance of an ETL
    Tracks the entire lifecycle from creation to completion
    """
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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ETL reference
    etl = models.ForeignKey(
        'etl.ETL',
        on_delete=models.CASCADE,
        related_name='executions'
    )

    # Execution metadata
    execution_label = models.CharField(
        max_length=200,
        blank=True,
        help_text="Optional label (e.g., 'January 2024')"
    )
    launched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='launched_executions'
    )

    # Status tracking
    status = models.CharField(
        max_length=50,
        choices=STATUS_CHOICES,
        default='PENDING'
    )

    # File paths
    work_dir = models.CharField(
        max_length=500,
        help_text="Execution workspace directory"
    )
    archive_path = models.CharField(
        max_length=500,
        blank=True,
        help_text="Path to archived execution"
    )

    # Timing
    launched_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Execution results
    return_code = models.IntegerField(
        null=True,
        blank=True,
        help_text="Exit code: 0=success, non-zero=failure"
    )
    stdout_log = models.TextField(blank=True, help_text="Standard output")
    stderr_log = models.TextField(blank=True, help_text="Error output")
    error_message = models.TextField(blank=True)

    # Runtime / environment details (filled by the execution engine)
    runtime_config = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Snapshot of the runtime configuration passed to the ETL "
            "process (paths to inputs, outputs directory, etc.)."
        ),
    )
    python_version_used = models.CharField(
        max_length=20,
        blank=True,
        help_text="Python version that actually ran this execution (e.g. '3.11.8').",
    )
    venv_path = models.CharField(
        max_length=500,
        blank=True,
        help_text="Filesystem path to the uv/virtual environment used for this run.",
    )
    dependencies_installed = models.BooleanField(
        default=False,
        help_text="True when requirements.txt was installed successfully in the venv.",
    )
    dependencies_log = models.TextField(
        blank=True,
        help_text="Raw log output from the dependency installation step (uv / pip).",
    )

    class Meta:
        app_label = 'execution'
        db_table = 'executions'
        ordering = ['-launched_at']
        verbose_name = 'Execution'
        verbose_name_plural = 'Executions'

    def __str__(self):
        return f"{self.etl.name} - {self.launched_at:%Y-%m-%d %H:%M}"

    @property
    def duration_seconds(self):
        """Calculate execution duration"""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None