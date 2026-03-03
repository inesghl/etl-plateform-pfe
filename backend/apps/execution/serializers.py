from rest_framework import serializers
from .models import Execution

class ExecutionSerializer(serializers.ModelSerializer):
   etl_name = serializers.CharField(source="etl.name", read_only=True)
   launched_by_username = serializers.CharField(
       source="launched_by.username",
       read_only=True,
   )


   class Meta:
       model = Execution
       fields = [
           "id",
           "etl",
           "etl_name",
           "execution_label",
           "launched_by",
           "launched_by_username",
           "status",
           "work_dir",
           "archive_path",
           "launched_at",
           "started_at",
           "completed_at",
           "return_code",
           "stdout_log",
           "stderr_log",
           "error_message",
           "runtime_config",
           "python_version_used",
           "venv_path",
           "dependencies_installed",
           "dependencies_log",
       ]
       read_only_fields = [
           "id",
           "etl_name",
           "launched_by_username",
           "status",
           "work_dir",
           "archive_path",
           "launched_at",
           "started_at",
           "completed_at",
           "return_code",
           "stdout_log",
           "stderr_log",
           "error_message",
           "runtime_config",
           "python_version_used",
           "venv_path",
           "dependencies_installed",
           "dependencies_log",
       ]




class ExecutionListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views"""
    etl_name = serializers.CharField(source='etl.name', read_only=True)
    launched_by_username = serializers.CharField(source='launched_by.username', read_only=True)
    duration_seconds = serializers.ReadOnlyField()

    class Meta:
        model = Execution
        fields = [
            'id',
            'etl_name',
            'execution_label',
            'status',
            'launched_by_username',
            'launched_at',
            'completed_at',
            'duration_seconds',
        ]