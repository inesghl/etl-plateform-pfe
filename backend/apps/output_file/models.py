from django.db import models
import uuid


class OutputFile(models.Model):
    """Output file produced by an ETL execution."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    execution = models.ForeignKey(
        'execution.Execution',       # ✅ cross-app string reference
        on_delete=models.CASCADE,
        related_name='output_files'
    )

    filename = models.CharField(max_length=500)
    file_path = models.CharField(max_length=1000, help_text="Absolute path to file")
    file_size = models.BigIntegerField(help_text="Size in bytes")
    file_type = models.CharField(max_length=50, help_text="e.g. excel, csv, pdf")

    created_at = models.DateTimeField(auto_now_add=True)

    # Download tracking
    download_count = models.IntegerField(default=0)
    last_downloaded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'output_file'    # ✅ required
        db_table = 'output_files'
        ordering = ['created_at']
        verbose_name = 'Output File'
        verbose_name_plural = 'Output Files'
        # ✅ Prevent duplicate filenames for same execution
        unique_together = [['execution', 'filename']]
    def __str__(self):
        return self.filename

    @property
    def file_size_mb(self):
        return round(self.file_size / (1024 * 1024), 2)