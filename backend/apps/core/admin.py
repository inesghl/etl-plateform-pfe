from django.contrib import admin
from .models import ETL, Execution, InputFile, OutputFile, AuditLog




@admin.register(ETL)
class ETLAdmin(admin.ModelAdmin):
    list_display = ['name', 'version', 'is_active', 'is_validated', 'created_by', 'created_at']
    list_filter = ['is_active', 'is_validated', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at', 'extracted_path']


    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'version')
        }),
        ('Files', {
            'fields': ('zip_file', 'extracted_path')
        }),
        ('Configuration', {
            'fields': ('config',),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('is_active', 'is_validated', 'validation_errors')
        }),
        ('Metadata', {
            'fields': ('id', 'created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )




@admin.register(Execution)
class ExecutionAdmin(admin.ModelAdmin):
    list_display = ['etl', 'execution_label', 'status', 'launched_by', 'launched_at', 'duration_display']
    list_filter = ['status', 'launched_at', 'etl']
    search_fields = ['etl__name', 'execution_label', 'launched_by__username']
    readonly_fields = ['id', 'launched_at', 'started_at', 'completed_at', 'duration_display']


    def duration_display(self, obj):
        duration = obj.duration_seconds
        if duration:
            minutes, seconds = divmod(int(duration), 60)
            return f"{minutes}m {seconds}s"
        return "-"


    duration_display.short_description = 'Duration'




@admin.register(InputFile)
class InputFileAdmin(admin.ModelAdmin):
    list_display = ['file_key', 'original_filename', 'execution', 'status', 'file_size_display', 'uploaded_at']
    list_filter = ['status', 'uploaded_at']
    search_fields = ['file_key', 'original_filename', 'execution__etl__name']


    def file_size_display(self, obj):
        size_mb = obj.file_size / (1024 * 1024)
        return f"{size_mb:.2f} MB"


    file_size_display.short_description = 'Size'




@admin.register(OutputFile)
class OutputFileAdmin(admin.ModelAdmin):
    list_display = ['filename', 'execution', 'file_size_display', 'download_count', 'created_at']
    list_filter = ['created_at', 'file_type']
    search_fields = ['filename', 'execution__etl__name']


    def file_size_display(self, obj):
        size_mb = obj.file_size / (1024 * 1024)
        return f"{size_mb:.2f} MB"


    file_size_display.short_description = 'Size'




@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'user', 'etl', 'execution', 'timestamp']
    list_filter = ['action', 'timestamp']
    search_fields = ['description', 'user__username', 'etl__name']
    readonly_fields = ['id', 'timestamp']



