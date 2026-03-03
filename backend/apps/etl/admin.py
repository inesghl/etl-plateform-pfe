from django.contrib import admin
from .models import ETL

@admin.register(ETL)
class ETLAdmin(admin.ModelAdmin):
    list_display = ['name', 'version', 'is_active', 'is_validated', 'created_by', 'created_at']
    list_filter = ['is_active', 'is_validated']
    search_fields = ['name', 'description']