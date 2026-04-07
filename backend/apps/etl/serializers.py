# etl/serializers.py
from rest_framework import serializers
from .models import ETL
from ..accounts.models import UserGroup
from ..accounts.serializers import UserGroupSerializer


class ETLSerializer(serializers.ModelSerializer):
    allowed_groups = UserGroupSerializer(many=True, read_only=True)
    allowed_group_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=UserGroup.objects.all(),
        source='allowed_groups',
        write_only=True,
        required=False,
    )
    is_restricted = serializers.SerializerMethodField()
    is_admin_user = serializers.SerializerMethodField()

    class Meta:
        model = ETL
        fields = [
            'id', 'name', 'description', 'version',
            'zip_file',
            'entry_point_path', 'config_file_path', 'requirements_path', 'python_version',
            'resolved_entry_point', 'resolved_config_file', 'resolved_requirements',
            'config', 'path_classifications',
            'allowed_groups', 'allowed_group_ids', 'is_restricted',
            'shared_venv_path', 'deps_installed_at',
            'is_active', 'is_validated', 'validation_errors',
            'created_by', 'created_at', 'updated_at',
            'is_admin_user',
        ]
        read_only_fields = [
            'id', 'resolved_entry_point', 'resolved_config_file', 'resolved_requirements',
            'config', 'shared_venv_path', 'deps_installed_at',
            'created_by', 'created_at', 'updated_at',
        ]

    def get_is_restricted(self, obj):
        return obj.allowed_groups.exists()

    def get_is_admin_user(self, obj):
        request = self.context.get('request')
        if request and hasattr(request.user, 'is_admin'):
            return request.user.is_admin
        return False