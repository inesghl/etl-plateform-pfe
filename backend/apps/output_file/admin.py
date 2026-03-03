from django.contrib import admin
from .models import OutputFile

@admin.register(OutputFile)
class OutputFileAdmin(admin.ModelAdmin):
    list_display = ['filename', 'execution', 'file_size_display', 'download_count', 'created_at']
    list_filter = ['created_at', 'file_type']
    search_fields = ['filename', 'execution__etl__name']


    def file_size_display(self, obj):
        size_mb = obj.file_size / (1024 * 1024)
        return f"{size_mb:.2f} MB"


    file_size_display.short_description = 'Size'


