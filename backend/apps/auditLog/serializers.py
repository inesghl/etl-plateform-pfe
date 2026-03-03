from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
   etl_name = serializers.CharField(source="etl.name", read_only=True)
   execution_label = serializers.CharField(
       source="execution.execution_label",
       read_only=True,
   )
   username = serializers.CharField(source="user.username", read_only=True)


   class Meta:
       model = AuditLog
       fields = [
           "id",
           "action",
           "description",
           "user",
           "username",
           "etl",
           "etl_name",
           "execution",
           "execution_label",
           "metadata",
           "timestamp",
       ]
       read_only_fields = [
           "id",
           "username",
           "etl_name",
           "execution_label",
           "timestamp",
       ]
