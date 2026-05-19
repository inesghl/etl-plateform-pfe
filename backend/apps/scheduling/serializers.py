# scheduling/serializers.py
from rest_framework import serializers
from .models import ETLSchedule


class ETLScheduleSerializer(serializers.ModelSerializer):
    """
    Serializer for ETLSchedule.

    Read:  all fields are visible to everyone (owner + admins).
    Write: non-admin users can write every field EXCEPT notify_target
           and notify_specific_email — those are admin-only.
           The backend always notifies the ETL creator regardless, so
           regular users get their notifications without touching those fields.
    """

    # Always expose these computed properties so the frontend can display them.
    effective_email    = serializers.ReadOnlyField()
    all_notify_emails  = serializers.ReadOnlyField()
    etl_name           = serializers.SerializerMethodField()

    class Meta:
        model  = ETLSchedule
        fields = [
            "id",
            "etl",
            "etl_name",
            "is_active",
            "frequency",
            "time_of_day",
            "day_of_week",
            "day_of_month",
            "month_of_year",
            # notification
            "notify_target",
            "notify_specific_email",
            "backup_email",
            "effective_email",
            "all_notify_emails",
            # timestamps
            "last_triggered_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "last_triggered_at"]

    def get_etl_name(self, obj) -> str:
        return obj.etl.name if obj.etl_id else ""

    # ── Admin-only write fields ───────────────────────────────────────────────
    def validate(self, attrs):
        request = self.context.get("request")
        user    = getattr(request, "user", None)
        is_admin = getattr(user, "is_admin", False) if user else False

        if not is_admin:
            # Silently drop admin-only fields — don't raise, just ignore.
            attrs.pop("notify_target",         None)
            attrs.pop("notify_specific_email", None)

        return attrs

    # ── Cross-field validation ────────────────────────────────────────────────
    def validate_day_of_week(self, value):
        if value is not None and not (0 <= value <= 6):
            raise serializers.ValidationError("day_of_week must be 0 (Monday) – 6 (Sunday).")
        return value

    def validate_day_of_month(self, value):
        if value is not None and not (1 <= value <= 31):
            raise serializers.ValidationError("day_of_month must be between 1 and 31.")
        return value

    def validate_month_of_year(self, value):
        if value is not None and not (1 <= value <= 12):
            raise serializers.ValidationError("month_of_year must be between 1 and 12.")
        return value

    # scheduling/serializers.py
    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_admin = getattr(user, "is_admin", False) if user else False

        if not is_admin:
            attrs.pop("notify_target", None)
            attrs.pop("notify_specific_email", None)
            # Ensure non-admins always get a safe default
            if "notify_target" not in attrs:
                attrs.setdefault("notify_target", "creator")

        return attrs