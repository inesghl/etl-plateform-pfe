from django.db import models
from django.conf import settings
import uuid


class ETL(models.Model):
    """ETL Definition uploaded by admin"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    version = models.CharField(max_length=50, default="1.0")

    zip_file = models.FileField(upload_to='etls/')
    extracted_path = models.CharField(max_length=500, blank=True)

    config = models.JSONField(default=dict, blank=True)

    is_active = models.BooleanField(default=False)
    is_validated = models.BooleanField(default=False)
    validation_errors = models.JSONField(default=list, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_etls')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'etls'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} v{self.version}"

    # Convenience helpers so the rest of the code does not have to
    # know the exact JSON structure every time.
    @property
    def entry_point(self) -> str:
        """
        Python file that should be executed as the ETL entry point.
        Defaults to 'main.py' if not present in config.
        """
        return self.config.get("entry_point", "main.py")

    @property
    def python_version(self) -> str | None:
        """
        Requested Python version for this ETL (e.g. '3.11').
        Used later to decide whether the current worker can run it.
        """
        return self.config.get("python_version")

    @property
    def input_requirements(self) -> dict:
        """
        Dict describing required / optional inputs.
        Keys are logical file names (e.g. 'facture_data').
        """
        return self.config.get("input_requirements", {}) or {}

    @property
    def expected_outputs(self) -> list[str]:
        """
        List of filenames that the ETL is expected to generate
        inside the outputs directory.
        """
        return self.config.get("expected_outputs", []) or []
