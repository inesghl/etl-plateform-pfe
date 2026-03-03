from rest_framework import serializers
from .models import OutputFile

class OutputFileSerializer(serializers.ModelSerializer):
   class Meta:
       model = OutputFile
       fields = [
           "id",
           "execution",
           "filename",
           "file_path",
           "file_size",
           "file_type",
           "created_at",
           "download_count",
           "last_downloaded_at",
       ]
       read_only_fields = [
           "id",
           "filename",
           "file_path",
           "file_size",
           "file_type",
           "created_at",
           "download_count",
           "last_downloaded_at",
       ]
