from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from django.utils import timezone
from .models import ETLSchedule, ScheduleRequest
from .serializers import ETLScheduleSerializer, ScheduleRequestSerializer


def _notify_admins_of_action(user, action_label: str, etl_name: str, schedule_id=None):
    """
    Notify OTHER admins when someone changes a schedule.
    The admin who performed the action is excluded — no self-notification.
    """
    try:
        from django.contrib.auth import get_user_model
        from ..notification.models import Notification

        User = get_user_model()
        # Exclude the user who performed the action
        other_admins = User.objects.filter(
            role="admin", is_active=True
        ).exclude(id=user.id)

        for admin in other_admins:
            Notification.objects.create(
                user=admin,
                title=f"📅 Schedule {action_label}: {etl_name}",
                message=(
                    f"{user.username} {action_label.lower()} "
                    f"a schedule for ETL \"{etl_name}\"."
                    + (f" (ID: {schedule_id})" if schedule_id else "")
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

        # Regular users: see schedules for ETLs they can access
        # (mirrors the same visibility logic as ETLViewSet.get_queryset)
        user_group_ids = list(user.user_groups.values_list("id", flat=True))
        return base_qs.filter(
            etl__is_active=True,
            etl__is_validated=True,
        ).filter(
            Q(etl__allowed_groups__isnull=True, etl__allowed_users__isnull=True)
            | Q(etl__allowed_groups__id__in=user_group_ids)
            | Q(etl__allowed_users=user)
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


# ─────────────────────────────────────────────────────────────
# ScheduleRequestViewSet — users request schedules, admin approves
# ─────────────────────────────────────────────────────────────

class ScheduleRequestViewSet(viewsets.ModelViewSet):
    """
    Users create requests for schedules.
    Admin reviews (approve / reject) requests.
    On approval, admin chooses scope: just the requester, their whole group,
    or a specific email.
    """
    serializer_class   = ScheduleRequestSerializer
    permission_classes = [IsAuthenticated]
    http_method_names  = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, "is_admin", False):
            return ScheduleRequest.objects.select_related(
                "etl", "requested_by", "reviewed_by"
            ).order_by("status", "-created_at")
        # Regular users see:
        #  - their own requests (any status)
        #  - pending requests from others for ETLs they can access
        #    (so they know a request is already in flight)
        user_group_ids = list(user.user_groups.values_list("id", flat=True))
        accessible_etl_filter = (
            Q(etl__allowed_groups__isnull=True, etl__allowed_users__isnull=True)
            | Q(etl__allowed_groups__id__in=user_group_ids)
            | Q(etl__allowed_users=user)
        )
        return ScheduleRequest.objects.filter(
            Q(requested_by=user) |
            Q(status="pending") & accessible_etl_filter
        ).select_related("etl", "requested_by").distinct().order_by("-created_at")

    def perform_create(self, serializer):
        etl = serializer.validated_data["etl"]

        # Each user with access to this ETL can request independently —
        # only block a duplicate pending request from the SAME user.
        existing = ScheduleRequest.objects.filter(
            etl=etl, requested_by=self.request.user, status="pending"
        ).first()
        if existing:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"detail": "You already have a pending schedule request for this ETL."}
            )

        req = serializer.save(requested_by=self.request.user)

        # Notify all admins about the new request
        try:
            from django.contrib.auth import get_user_model
            from ..notification.models import Notification
            User = get_user_model()
            for admin in User.objects.filter(role="admin", is_active=True):
                Notification.objects.create(
                    user=admin,
                    title=f"📅 Schedule requested: {etl.name}",
                    message=(
                        f"{self.request.user.username} requested a "
                        f"{req.frequency} schedule for \"{etl.name}\""
                        + (f": \"{req.note}\"" if req.note else ".")
                    ),
                    notification_type="info",
                )
        except Exception as e:
            import logging
            logging.getLogger("scheduling").warning("Admin notify for request failed: %s", e)

    # ── approve ────────────────────────────────────────────────────────
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Admin approves a schedule request.
        Body: {
            scope: "requester" | "group" | "specific",
            specific_email: "...",    (only when scope=specific)
            admin_note: "..."         (optional)
        }
        Creates or replaces the ETLSchedule for this ETL.
        """
        if not getattr(request.user, "is_admin", False):
            return Response({"detail": "Only admins can approve requests."}, status=403)

        req: ScheduleRequest = self.get_object()
        if req.status != "pending":
            return Response(
                {"detail": f"This request is already {req.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scope          = request.data.get("scope", "requester")
        specific_email = request.data.get("specific_email", "")
        admin_note     = request.data.get("admin_note", "")

        if scope not in ("requester", "group", "specific"):
            return Response({"detail": "scope must be: requester, group, specific."}, status=400)
        if scope == "specific" and not specific_email:
            return Response({"detail": "specific_email is required when scope=specific."}, status=400)

        # Map scope → notify_target on ETLSchedule
        notify_target_map = {
            "requester": "specific",   # notify just this user
            "group":     "group",
            "specific":  "specific",
        }
        notify_email = (
            req.requested_by.email if scope == "requester"
            else specific_email if scope == "specific"
            else ""
        )

        # Create or replace the ETLSchedule
        ETLSchedule.objects.filter(etl=req.etl).delete()
        schedule = ETLSchedule.objects.create(
            etl=req.etl,
            is_active=True,
            frequency=req.frequency,
            time_of_day=req.time_of_day,
            day_of_week=req.day_of_week,
            day_of_month=req.day_of_month,
            month_of_year=req.month_of_year,
            notify_target=notify_target_map[scope],
            notify_specific_email=notify_email,
        )

        # Update the request
        req.status                 = "approved"
        req.approved_scope         = scope
        req.approved_specific_email = notify_email
        req.admin_note             = admin_note
        req.reviewed_by            = request.user
        req.reviewed_at            = timezone.now()
        req.save()

        # Notify the requester
        try:
            from ..notification.models import Notification
            scope_label = {
                "requester": "you only",
                "group":     "your entire group",
                "specific":  specific_email,
            }[scope]
            freq_label = dict(ETLSchedule._meta.get_field("frequency").choices).get(
                req.frequency, req.frequency
            )
            Notification.objects.create(
                user=req.requested_by,
                title=f"✅ Schedule approved: {req.etl.name}",
                message=(
                    f"Your schedule request for \"{req.etl.name}\" has been approved. "
                    f"It will run {freq_label} at {req.time_of_day.strftime('%H:%M')}. "
                    f"Notifications will go to {scope_label}."
                    + (f" Admin note: {admin_note}" if admin_note else "")
                ),
                notification_type="success",
            )
        except Exception as e:
            import logging
            logging.getLogger("scheduling").warning("Requester notify failed: %s", e)

        # One approval becomes THE schedule for the whole ETL — auto-reject
        # every other still-pending request for it so they don't dangle,
        # and let those requesters know why.
        other_pending = ScheduleRequest.objects.filter(
            etl=req.etl, status="pending"
        ).exclude(id=req.id)
        for other in other_pending:
            other.status = "rejected"
            other.admin_note = f"Another schedule request for this ETL was approved by {request.user.username}."
            other.reviewed_by = request.user
            other.reviewed_at = timezone.now()
            other.save()
            try:
                from ..notification.models import Notification
                Notification.objects.create(
                    user=other.requested_by,
                    title=f"ℹ️ Schedule request closed: {other.etl.name}",
                    message=(
                        f"Another user's schedule request for \"{other.etl.name}\" was approved instead. "
                        f"The ETL now has an active schedule."
                    ),
                    notification_type="info",
                )
            except Exception:
                pass

        return Response({
            "detail": "Request approved. Schedule created.",
            "schedule": ETLScheduleSerializer(schedule).data,
            "request":  ScheduleRequestSerializer(req).data,
        })

    # ── reject ─────────────────────────────────────────────────────────
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Admin rejects a request with an optional reason."""
        if not getattr(request.user, "is_admin", False):
            return Response({"detail": "Only admins can reject requests."}, status=403)

        req: ScheduleRequest = self.get_object()
        if req.status != "pending":
            return Response(
                {"detail": f"This request is already {req.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        admin_note  = request.data.get("note", "")
        req.status  = "rejected"
        req.admin_note = admin_note
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save()

        # Notify the requester
        try:
            from ..notification.models import Notification
            Notification.objects.create(
                user=req.requested_by,
                title=f"❌ Schedule request declined: {req.etl.name}",
                message=(
                    f"Your schedule request for \"{req.etl.name}\" was not approved."
                    + (f" Reason: {admin_note}" if admin_note else "")
                ),
                notification_type="warning",
            )
        except Exception:
            pass

        return Response(ScheduleRequestSerializer(req).data)