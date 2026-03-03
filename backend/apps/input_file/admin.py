from django.contrib import admin
from .models import InputFile
@admin.register(InputFile)
class InputFileAdmin(admin.ModelAdmin):
    list_display = ['file_key', 'original_filename', 'execution', 'status', 'file_size_display', 'uploaded_at']
    list_filter = ['status', 'uploaded_at']
    search_fields = ['file_key', 'original_filename', 'execution__etl__name']


    def file_size_display(self, obj):
        size_mb = obj.file_size / (1024 * 1024)
        return f"{size_mb:.2f} MB"


    file_size_display.short_description = 'Size'


