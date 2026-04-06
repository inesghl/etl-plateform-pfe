"""
notification/models.py
"""
import uuid
from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPE_CHOICES = [
        ("success", "Success"),
        ("error",   "Error"),
        ("info",    "Info"),
        ("warning", "Warning"),
    ]

    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True, blank=True,   # null = broadcast to all users
    )
    # Optional link back to the execution that triggered this
    execution = models.ForeignKey(
        "execution.Execution",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="notifications",
    )

    title             = models.CharField(max_length=300)
    message           = models.TextField(blank=True)
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="info")
    is_read           = models.BooleanField(default=False)
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notification"
        db_table  = "notifications"
        ordering  = ["-created_at"]

    def __str__(self):
        return f"[{self.notification_type}] {self.title}"