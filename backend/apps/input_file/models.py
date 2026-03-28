from django.db import models
from django.conf import settings
import uuid

def input_file_upload_path(instance, filename):
    """
    Upload files directly to the execution's inputs folder.
    Path: executions/<execution_id>/inputs/<filename>
    """
    return f'executions/{instance.execution.id}/inputs/{filename}'
class InputFile(models.Model):
    """
    Input file uploaded by user for an execution
    """
    STATUS_CHOICES = [
        ('UPLOADED', 'Uploaded'),
        ('VALIDATED', 'Validated'),
        ('INVALID', 'Invalid'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Belongs to execution
    execution = models.ForeignKey(
        'execution.Execution',
        on_delete=models.CASCADE,
        related_name='input_files'
    )

    # File information
    file_key = models.CharField(
        max_length=100,
        help_text="Key from ETL config (e.g., 'facture_data')"
    )
    original_filename = models.CharField(
        max_length=500,
        help_text="User's original filename"
    )
    uploaded_file = models.FileField(upload_to=input_file_upload_path)
    file_size = models.BigIntegerField(help_text="Size in bytes")

    # Validation
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='UPLOADED'
    )
    validation_errors = models.JSONField(default=list, blank=True)

    # Metadata
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )

    class Meta:
        db_table = 'input_files'
        ordering = ['uploaded_at']

    def __str__(self):
        return f"{self.file_key}: {self.original_filename}"