from django.db import models
from django.conf import settings
import uuid


class ETL(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    version = models.CharField(max_length=50, default="1.0")

    zip_file = models.FileField(upload_to='etls/')
    extracted_path = models.CharField(max_length=500, blank=True)

    # Admin-provided filenames — searched recursively in the ZIP
    entry_point_path = models.CharField(
        max_length=500, blank=True,
        help_text="Filename of the entry script, e.g. 'main.py'"
    )
    config_file_path = models.CharField(
        max_length=500, blank=True,
        help_text="Filename of the config file, e.g. 'config.json'"
    )
    requirements_path = models.CharField(
        max_length=500, blank=True,
        help_text="Filename of requirements file, e.g. 'requirements.txt'"
    )
    python_version = models.CharField(max_length=20, blank=True)

    # Resolved absolute paths after search
    resolved_entry_point = models.CharField(max_length=1000, blank=True)
    resolved_config_file = models.CharField(max_length=1000, blank=True)
    resolved_requirements = models.CharField(max_length=1000, blank=True)

    # Parsed config from the config file
    config = models.JSONField(default=dict, blank=True)

    # Admin classifies which config keys are inputs/outputs
    # { "key_name": "input" | "output" | "other" }
    path_classifications = models.JSONField(
        default=dict, blank=True,
        help_text="Admin classifies which config keys point to input/output paths"
    )

    # Shared venv — created once, reused across executions
    shared_venv_path = models.CharField(max_length=1000, blank=True)
    deps_installed_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=False)
    is_validated = models.BooleanField(default=False)
    validation_errors = models.JSONField(default=list, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_etls'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'etls'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} v{self.version}"

    @property
    def entry_point(self) -> str:
        return self.resolved_entry_point or self.entry_point_path or "main.py"

    @property
    def input_requirements(self) -> dict:
        return self.config.get("input_requirements", {}) or {}

    @property
    def expected_outputs(self) -> list:
        return self.config.get("expected_outputs", []) or []

    @property
    def has_shared_venv(self) -> bool:
        if not self.shared_venv_path:
            return False
        from pathlib import Path
        venv = Path(self.shared_venv_path)
        python = venv / ("Scripts/python.exe" if __import__('os').name == "nt" else "bin/python")
        return python.exists()