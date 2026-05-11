# scheduling/serializers.py  — full replacement
from rest_framework import serializers
from .models import ETLSchedule


class ETLScheduleSerializer(serializers.ModelSerializer):
    etl_name          = serializers.CharField(source="etl.name", read_only=True)
    effective_email   = serializers.CharField(read_only=True)
    all_notify_emails = serializers.ListField(
        child=serializers.EmailField(), read_only=True
    )

    class Meta:
        model  = ETLSchedule
        fields = [
            "id", "etl", "etl_name",
            "is_active",
            "frequency",
            "time_of_day",
            "day_of_week",     # weekly
            "day_of_month",    # monthly
            "month_of_year",   # yearly
            "day_of_year",     # yearly
            # notification
            "notify_target", "notify_specific_email", "backup_email",
            "effective_email", "all_notify_emails",
            # launch ownership
            "launched_for",
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

        # weekly
        if freq == "weekly" and data.get("day_of_week") is None:
            if not (self.instance and self.instance.day_of_week is not None):
                raise serializers.ValidationError(
                    {"day_of_week": "Required for weekly frequency."}
                )

        # monthly
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

        # yearly
        if freq == "yearly":
            moy = data.get("month_of_year")
            doy = data.get("day_of_year")
            if moy is None:
                if not (self.instance and self.instance.month_of_year is not None):
                    raise serializers.ValidationError(
                        {"month_of_year": "Required for yearly frequency."}
                    )
            elif not (1 <= moy <= 12):
                raise serializers.ValidationError(
                    {"month_of_year": "Must be between 1 and 12."}
                )
            if doy is None:
                if not (self.instance and self.instance.day_of_year is not None):
                    raise serializers.ValidationError(
                        {"day_of_year": "Required for yearly frequency."}
                    )
            elif not (1 <= doy <= 28):
                raise serializers.ValidationError(
                    {"day_of_year": "Must be between 1 and 28."}
                )

        # Non-admins are locked to notify_target="creator"
        request = self.context.get("request")
        if request and not getattr(request.user, "is_admin", False):
            data["notify_target"] = "creator"
            data["notify_specific_email"] = ""
            data["launched_for"] = None  # always themselves (creator)

        return data