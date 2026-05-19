from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from .models import ETLSchedule
from .serializers import ETLScheduleSerializer


def _notify_admins_of_action(user, action_label: str, etl_name: str, schedule_id=None):
    """Create an in-app notification for every admin whenever a user touches a schedule."""
    try:
        from django.contrib.auth import get_user_model
        from ..notification.models import Notification

        User = get_user_model()
        admins = User.objects.filter(role="admin", is_active=True)
        for admin in admins:
            Notification.objects.create(
                user=admin,
                title=f"📅 Schedule {action_label}: {etl_name}",
                message=(
                    f"User '{user.username}' ({user.email}) {action_label.lower()} "
                    f"a schedule for ETL \"{etl_name}\"."
                    + (f" (Schedule ID: {schedule_id})" if schedule_id else "")
                ),
                notification_type="info",
            )
    except Exception as exc:
        import logging
        logging.getLogger("scheduling").warning(
            "Admin notify failed for %s: %s", action_label, exc
        )


class ETLScheduleViewSet(viewsets.ModelViewSet):
    serializer_class   = ETLScheduleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        base_qs = (
            ETLSchedule.objects
            .select_related("etl", "etl__created_by")
            .prefetch_related("etl__allowed_groups", "etl__allowed_groups__members")
        )
        if getattr(user, "is_admin", False):
            return base_qs.all().order_by("-created_at")

        # Regular users: schedules for ETLs they created OR are in the allowed group for
        return base_qs.filter(
            Q(etl__created_by=user) |
            Q(etl__allowed_groups__members=user)
        ).distinct().order_by("-created_at")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def perform_create(self, serializer):
        schedule = serializer.save()
        _notify_admins_of_action(
            self.request.user, "Created", schedule.etl.name, schedule.id
        )

    def perform_update(self, serializer):
        schedule = serializer.save()
        _notify_admins_of_action(
            self.request.user, "Updated", schedule.etl.name, schedule.id
        )

    def perform_destroy(self, instance):
        etl_name    = instance.etl.name
        schedule_id = instance.id
        instance.delete()
        _notify_admins_of_action(
            self.request.user, "Deleted", etl_name, schedule_id
        )

    # ── Toggle active/inactive — ALL users (for their own ETLs) ──────────────
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def toggle(self, request, pk=None):
        """
        Pause or resume a schedule. Available to all users for ETLs they own.
        Admins can toggle any schedule. Scoped by get_queryset.
        """
        schedule: ETLSchedule = self.get_object()

        schedule.is_active = not schedule.is_active
        schedule.save(update_fields=["is_active"])

        state = "Activated" if schedule.is_active else "Deactivated"
        _notify_admins_of_action(request.user, state, schedule.etl.name, schedule.id)
        _notify_user_of_toggle(request.user, schedule, state)

        return Response(
            ETLScheduleSerializer(schedule, context={"request": request}).data
        )

    # ── Fire Now — ALL users (for their own ETLs) ────────────────────────────
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def fire_now(self, request, pk=None):
        """
        Immediately create a PENDING execution for this schedule and send
        the standard schedule notifications (email + in-app).
        Available to all users for ETLs they own. Admins can trigger any schedule.
        Scoped by get_queryset so users can never trigger another user's schedule.
        """
        schedule: ETLSchedule = self.get_object()

        from django.utils import timezone
        from ..execution.models import Execution
        from .scheduler import _send_schedule_notifications

        now = timezone.localtime()
        etl = schedule.etl

        execution = Execution.objects.create(
            etl=etl,
            launched_by=request.user,
            status="PENDING",
            execution_config=dict(etl.config),
            execution_label=(
                f"{etl.name} — manual trigger {now.strftime('%Y-%m-%d %H:%M')}"
            ),
        )

        _send_schedule_notifications(schedule, execution, now)

        schedule.last_triggered_at = now
        schedule.save(update_fields=["last_triggered_at"])

        _notify_admins_of_action(
            request.user, "Manually triggered", etl.name, schedule.id
        )

        return Response(
            {"detail": "Execution created.", "execution_id": str(execution.id)},
            status=status.HTTP_201_CREATED,
        )


def _notify_user_of_toggle(user, schedule: ETLSchedule, state: str):
    """Send the user a confirmation notification when they pause/resume their schedule."""
    try:
        from ..notification.models import Notification

        etl = schedule.etl
        Notification.objects.create(
            user=user,
            title=f"{'⏸' if state == 'Deactivated' else '▶'} Schedule {state}: {etl.name}",
            message=(
                f"Your schedule for \"{etl.name}\" has been {state.lower()}. "
                f"Frequency: {schedule.frequency} at {schedule.time_of_day.strftime('%H:%M')}."
            ),
            notification_type="info",
        )
    except Exception as exc:
        import logging
        logging.getLogger("scheduling").warning("User toggle notify failed: %s", exc)