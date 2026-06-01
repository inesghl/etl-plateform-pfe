from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from .models import ETLSchedule
from .serializers import ETLScheduleSerializer


def _notify_admins_of_action(user, action_label: str, etl_name: str, schedule_id=None):
    """Create an in-app notification for every admin whenever someone touches a schedule."""
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

        # Regular users: can SEE schedules for ETLs assigned to their groups
        # (read-only — enforced in create/update/destroy/toggle below)
        return base_qs.filter(
            Q(etl__allowed_groups__members=user)
        ).distinct().order_by("-created_at")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    # ── CREATE — admin only ───────────────────────────────────────────────────
    def perform_create(self, serializer):
        if not getattr(self.request.user, "is_admin", False):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only administrators can create schedules.")
        schedule = serializer.save()
        _notify_admins_of_action(
            self.request.user, "Created", schedule.etl.name, schedule.id
        )

    # ── UPDATE — admin only ───────────────────────────────────────────────────
    def perform_update(self, serializer):
        if not getattr(self.request.user, "is_admin", False):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only administrators can edit schedules.")
        schedule = serializer.save()
        _notify_admins_of_action(
            self.request.user, "Updated", schedule.etl.name, schedule.id
        )

    # ── DELETE — admin only ───────────────────────────────────────────────────
    def perform_destroy(self, instance):
        if not getattr(self.request.user, "is_admin", False):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only administrators can delete schedules.")
        etl_name    = instance.etl.name
        schedule_id = instance.id
        instance.delete()
        _notify_admins_of_action(
            self.request.user, "Deleted", etl_name, schedule_id
        )

    # ── TOGGLE (pause/resume) — admin only ────────────────────────────────────
    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        if not getattr(request.user, "is_admin", False):
            return Response(
                {"detail": "Only administrators can pause or resume schedules."},
                status=status.HTTP_403_FORBIDDEN,
            )
        schedule: ETLSchedule = self.get_object()
        schedule.is_active = not schedule.is_active
        schedule.save(update_fields=["is_active"])

        state = "Activated" if schedule.is_active else "Deactivated"
        _notify_admins_of_action(request.user, state, schedule.etl.name, schedule.id)

        return Response(
            ETLScheduleSerializer(schedule, context={"request": request}).data
        )

    # ── FIRE NOW — all users ──────────────────────────────────────────────────
    @action(detail=True, methods=["post"])
    def fire_now(self, request, pk=None):
        """
        Any user who can see the schedule (i.e. belongs to an assigned group)
        can trigger an immediate personal PENDING execution.
        This does NOT modify the schedule itself.
        """
        schedule: ETLSchedule = self.get_object()  # queryset already scopes access

        from django.utils import timezone
        from ..execution.models import Execution
        from .scheduler import _send_schedule_notifications

        now = timezone.localtime()
        etl = schedule.etl

        execution = Execution.objects.create(
            etl=etl,
            launched_by=request.user,       # scoped to THIS user
            status="PENDING",
            execution_config=dict(etl.config),
            execution_label=(
                f"{etl.name} — manual trigger {now.strftime('%Y-%m-%d %H:%M')}"
            ),
        )

        _send_schedule_notifications(schedule, execution, now)

        # Do NOT update last_triggered_at — that belongs to the automatic scheduler
        # Updating it here would confuse the double-fire guard

        return Response(
            {"detail": "Execution created.", "execution_id": str(execution.id)},
            status=status.HTTP_201_CREATED,
        )