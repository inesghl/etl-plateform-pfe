from rest_framework import serializers
from .models import Notification

class NotificationSerializer(serializers.ModelSerializer):
   etl_name = serializers.CharField(source="etl.name", read_only=True)
   execution_label = serializers.CharField(
       source="execution.execution_label",
       read_only=True,
   )


   class Meta:
       model = Notification
       fields = [
           "id",
           "user",
           "etl",
           "etl_name",
           "execution",
           "execution_label",
           "level",
           "title",
           "message",
           "is_read",
           "created_at",
       ]
       read_only_fields = [
           "id",
           "user",
           "etl_name",
           "execution_label",
           "created_at",
       ]



