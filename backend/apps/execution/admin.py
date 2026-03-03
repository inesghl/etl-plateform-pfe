from django.contrib import admin
from .models import Execution


@admin.register(Execution)
class ExecutionAdmin(admin.ModelAdmin):
    list_display = [
        'etl',
        'execution_label',
        'status',
        'launched_by',
        'launched_at',
        'duration_display'
    ]
    list_filter = ['status', 'launched_at', 'etl']
    search_fields = ['etl__name', 'execution_label', 'launched_by__username']
    readonly_fields = ['id', 'launched_at', 'started_at', 'completed_at', 'duration_display']

    fieldsets = (
        ('Basic Information', {
            'fields': ('etl', 'execution_label', 'launched_by')
        }),
        ('Status', {
            'fields': ('status', 'work_dir', 'archive_path')
        }),
        ('Timing', {
            'fields': ('launched_at', 'started_at', 'completed_at', 'duration_display')
        }),
        ('Results', {
            'fields': ('return_code', 'error_message'),
            'classes': ('collapse',)
        }),
        ('Logs', {
            'fields': ('stdout_log', 'stderr_log'),
            'classes': ('collapse',)
        }),
    )

    def duration_display(self, obj):
        """Display duration in human-readable format"""
        duration = obj.duration_seconds
        if duration:
            minutes, seconds = divmod(int(duration), 60)
            return f"{minutes}m {seconds}s"
        return "-"

    duration_display.short_description = 'Duration'