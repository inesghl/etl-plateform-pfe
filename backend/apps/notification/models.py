from django.db import models
from django.conf import settings
import uuid

class Notification(models.Model):
   """
   Simple user notification model.


   Used to inform users/admins about validation results, dependency
   installation failures, execution completion, etc.
   """


   LEVEL_CHOICES = [
       ("info", "Info"),
       ("warning", "Warning"),
       ("error", "Error"),
       ("success", "Success"),
   ]


   id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)


   # Who should see this notification
   user = models.ForeignKey(
       settings.AUTH_USER_MODEL,
       on_delete=models.CASCADE,
       related_name="notifications",
   )


   # Optional context
   etl = models.ForeignKey(
       ETL,
       on_delete=models.SET_NULL,
       null=True,
       blank=True,
       related_name="notifications",
   )
   execution = models.ForeignKey(
       Execution,
       on_delete=models.SET_NULL,
       null=True,
       blank=True,
       related_name="notifications",
   )


   # Payload
   level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default="info")
   title = models.CharField(max_length=200)
   message = models.TextField()
   is_read = models.BooleanField(default=False)


   created_at = models.DateTimeField(auto_now_add=True)


   class Meta:
       db_table = "notifications"
       ordering = ["-created_at"]


   def __str__(self) -> str:
       return f"[{self.level}] {self.title}"
