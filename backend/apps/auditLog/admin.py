from django.contrib import admin
from .models import  AuditLog

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'user', 'etl', 'execution', 'timestamp']
    list_filter = ['action', 'timestamp']
    search_fields = ['description', 'user__username', 'etl__name']
    readonly_fields = ['id', 'timestamp']

