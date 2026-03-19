from rest_framework import serializers
from .models import InputFile


class InputFileSerializer(serializers.ModelSerializer):
    """Serializer for input files"""

    # ✅ ADD these fields as SerializerMethodField
    file_url = serializers.SerializerMethodField()
    is_user_uploaded = serializers.SerializerMethodField()

    class Meta:
        model = InputFile
        fields = [
            "id",
            "execution",
            "file_key",
            "original_filename",
            "uploaded_file",
            "file_url",  #
            "file_size",
            "status",
            "validation_errors",
            "uploaded_at",
            "uploaded_by",
            "is_user_uploaded",
        ]
        read_only_fields = [
            "id",
            "original_filename",
            "file_size",
            "status",
            "validation_errors",
            "uploaded_at",
            "uploaded_by",
            "file_url",
            "is_user_uploaded",
        ]

    def get_file_url(self, obj):
        """Get download URL for the file"""
        request = self.context.get('request')
        if request and obj.uploaded_file:
            return request.build_absolute_uri(obj.uploaded_file.url)
        return None

    def get_is_user_uploaded(self, obj):
        """Check if this was uploaded by user (vs default from ETL)"""
        # User uploads are in input_files/ folder
        # Default inputs would be in executions/*/inputs/ (copied from ETL)
        file_path = str(obj.uploaded_file.path) if obj.uploaded_file else ""
        return 'executions' in file_path and 'inputs' in file_path