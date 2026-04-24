from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..accounts.permissions import IsAdmin
from .models import ETLSchedule
from .serializers import ETLScheduleSerializer


def _notify_admins_of_action(user, action_label: str, etl_name: str, schedule_id=None):
    """Create an in-app notification for every admin whenever a user touches a schedule."""
    try:
        from django.contrib.auth import get_user_model
        from ..notification.models import Notification

        User = get_user_model()
        admins = User.objects.filter(is_admin=True, is_active=True)
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
        if getattr(user, "is_admin", False):
            return ETLSchedule.objects.select_related("etl", "etl__created_by").all().order_by("-created_at")
        # Regular users: see schedules only for ETLs they own
        return ETLSchedule.objects.select_related("etl", "etl__created_by").filter(
            etl__created_by=user
        ).order_by("-created_at")

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
        etl_name = instance.etl.name
        schedule_id = instance.id
        instance.delete()
        _notify_admins_of_action(
            self.request.user, "Deleted", etl_name, schedule_id
        )

    # ── Admin-only: toggle active/inactive ───────────────────────────────────
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def toggle(self, request, pk=None):
        schedule: ETLSchedule = self.get_object()
        schedule.is_active = not schedule.is_active
        schedule.save(update_fields=["is_active"])
        state = "Activated" if schedule.is_active else "Deactivated"
        _notify_admins_of_action(request.user, state, schedule.etl.name, schedule.id)
        return Response(ETLScheduleSerializer(schedule, context={"request": request}).data)

    # ── Admin-only: manually trigger a schedule immediately ──────────────────
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def fire_now(self, request, pk=None):
        """
        Admin-only shortcut: immediately create a PENDING execution for this
        schedule, send notifications, and stamp last_triggered_at.
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
            execution_label=f"{etl.name} — manual trigger {now.strftime('%Y-%m-%d %H:%M')}",
        )

        _send_schedule_notifications(schedule, execution, now)

        schedule.last_triggered_at = now
        schedule.save(update_fields=["last_triggered_at"])

        _notify_admins_of_action(request.user, "Manually triggered", etl.name, schedule.id)

        return Response(
            {"detail": "Execution created.", "execution_id": str(execution.id)},
            status=status.HTTP_201_CREATED,
        )