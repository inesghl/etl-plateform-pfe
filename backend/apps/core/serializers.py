from rest_framework import serializers

from .models import ETL


class ETLSerializer(serializers.ModelSerializer):
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
            'created_by',
            'created_at',
            'updated_at',
        ]

