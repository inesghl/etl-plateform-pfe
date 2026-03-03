from rest_framework import serializers
from .models import InputFile


class InputFileSerializer(serializers.ModelSerializer):
   class Meta:
       model = InputFile
       fields = [
           "id",
           "execution",
           "file_key",
           "original_filename",
           "uploaded_file",
           "file_size",
           "status",
           "validation_errors",
           "uploaded_at",
           "uploaded_by",
       ]
       read_only_fields = [
           "id",
           "original_filename",
           "file_size",
           "status",
           "validation_errors",
           "uploaded_at",
           "uploaded_by",
       ]
