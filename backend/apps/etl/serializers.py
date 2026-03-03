from rest_framework import serializers
from .models import ETL


class ETLSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ETL
        fields = [
            'id',
            'name',
            'description',
            'version',
            'zip_file',
            'extracted_path',
            'config',
            'is_active',
            'is_validated',
            'validation_errors',
            'created_by',
            'created_by_username',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'extracted_path',
            'config',
            'is_active',
            'is_validated',
            'validation_errors',
            'created_by',           # ✅ frontend never sends this
            'created_by_username',
            'created_at',
            'updated_at',
        ]