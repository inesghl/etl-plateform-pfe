from django.db import models
from django.conf import settings
import uuid


class AuditLog(models.Model):
   """
   Complete audit trail of all actions in the platform
   """
   ACTION_CHOICES = [
       ('ETL_UPLOADED', 'ETL Uploaded'),
       ('ETL_VALIDATED', 'ETL Validated'),
       ('ETL_ACTIVATED', 'ETL Activated'),
       ('ETL_DEACTIVATED', 'ETL Deactivated'),
       ('EXECUTION_CREATED', 'Execution Created'),
       ('INPUT_UPLOADED', 'Input File Uploaded'),
       ('EXECUTION_STARTED', 'Execution Started'),
       ('EXECUTION_COMPLETED', 'Execution Completed'),
       ('EXECUTION_FAILED', 'Execution Failed'),
       ('OUTPUT_DOWNLOADED', 'Output File Downloaded'),
       ('EXECUTION_ARCHIVED', 'Execution Archived'),
   ]




   id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)




   # What happened
   action = models.CharField(max_length=50, choices=ACTION_CHOICES)
   description = models.TextField()




   # Who did it
   user = models.ForeignKey(
       settings.AUTH_USER_MODEL,
       on_delete=models.SET_NULL,
       null=True
   )




   # When
   timestamp = models.DateTimeField(auto_now_add=True)




   # Context
   etl = models.ForeignKey(ETL, on_delete=models.SET_NULL, null=True, blank=True)
   execution = models.ForeignKey(Execution, on_delete=models.SET_NULL, null=True, blank=True)




   # Additional data
   metadata = models.JSONField(default=dict, blank=True)




   class Meta:
       db_table = 'audit_logs'
       ordering = ['-timestamp']




   def __str__(self):
       return f"{self.action} - {self.timestamp:%Y-%m-%d %H:%M}"
