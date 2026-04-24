from rest_framework import serializers
from .models import ETLSchedule


class ETLScheduleSerializer(serializers.ModelSerializer):
    etl_name       = serializers.CharField(source="etl.name", read_only=True)
    effective_email = serializers.CharField(read_only=True)
    all_notify_emails = serializers.ListField(
        child=serializers.EmailField(), read_only=True
    )

    class Meta:
        model  = ETLSchedule
        fields = [
            "id", "etl", "etl_name",
            "is_active",
            "frequency", "time_of_day", "day_of_week", "day_of_month",
            # notification fields
            "notify_target", "notify_specific_email", "backup_email",
            "effective_email", "all_notify_emails",
            # timestamps
            "last_triggered_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "etl_name", "effective_email",
            "all_notify_emails", "last_triggered_at",
            "created_at", "updated_at",
        ]

    def validate(self, data):
        freq = data.get("frequency", getattr(self.instance, "frequency", "daily"))
        if freq == "weekly" and data.get("day_of_week") is None:
            if not (self.instance and self.instance.day_of_week is not None):
                raise serializers.ValidationError(
                    {"day_of_week": "Required for weekly frequency."}
                )
        if freq == "monthly":
            dom = data.get("day_of_month")
            if dom is None:
                if not (self.instance and self.instance.day_of_month is not None):
                    raise serializers.ValidationError(
                        {"day_of_month": "Required for monthly frequency."}
                    )
            elif not (1 <= dom <= 28):
                raise serializers.ValidationError(
                    {"day_of_month": "Must be between 1 and 28."}
                )

        # Only admins may set notify_target != "creator"
        request = self.context.get("request")
        if request and not (hasattr(request.user, "is_admin") and request.user.is_admin):
            data["notify_target"] = "creator"
            data["notify_specific_email"] = ""

        return data