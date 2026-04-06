from rest_framework import serializers
from .models import ETL


class ETLSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(
        source='created_by.username', read_only=True
    )
    has_shared_venv = serializers.BooleanField(read_only=True)

    class Meta:
        model = ETL
        fields = [
            'id', 'name', 'description', 'version',
            'zip_file', 'extracted_path',
            'entry_point_path', 'config_file_path',
            'requirements_path', 'python_version',
            'resolved_entry_point', 'resolved_config_file', 'resolved_requirements',
            'config', 'path_classifications',
            'shared_venv_path', 'deps_installed_at', 'has_shared_venv',
            'is_active', 'is_validated', 'validation_errors',
            'created_by', 'created_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'extracted_path',
            'resolved_entry_point', 'resolved_config_file', 'resolved_requirements',
            'config',
            'shared_venv_path', 'deps_installed_at', 'has_shared_venv',
            'is_active', 'is_validated', 'validation_errors',
            'created_by', 'created_by_username',
            'created_at', 'updated_at',
        ]