"""
scheduling/serializers.py
"""
from rest_framework import serializers
from .models import ETLSchedule


class ETLScheduleSerializer(serializers.ModelSerializer):
    etl_name = serializers.CharField(source="etl.name", read_only=True)
    effective_email = serializers.CharField(read_only=True)

    class Meta:
        model = ETLSchedule
        fields = [
            "id", "etl", "etl_name", "is_active",
            "frequency", "time_of_day",
            "day_of_week", "day_of_month",
            "notify_email", "effective_email",
            "last_triggered_at", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "last_triggered_at"]

    def validate(self, data):
        freq = data.get("frequency", getattr(self.instance, "frequency", None))
        if freq == "weekly" and data.get("day_of_week") is None:
            if not self.instance or self.instance.day_of_week is None:
                raise serializers.ValidationError(
                    {"day_of_week": "Required for weekly schedules."}
                )
        if freq == "monthly":
            dom = data.get("day_of_month", getattr(self.instance, "day_of_month", None))
            if dom is None:
                raise serializers.ValidationError(
                    {"day_of_month": "Required for monthly schedules."}
                )
            if not (1 <= dom <= 28):
                raise serializers.ValidationError(
                    {"day_of_month": "Must be between 1 and 28."}
                )
        return data