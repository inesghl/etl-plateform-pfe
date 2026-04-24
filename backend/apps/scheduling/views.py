
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..accounts.permissions import IsAdmin, IsAdminOrReadOnly
from .models import ETLSchedule
from .serializers import ETLScheduleSerializer


class ETLScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ETLScheduleSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, "is_admin") and user.is_admin:
            return ETLSchedule.objects.select_related("etl").all().order_by("-created_at")
        # Regular users see schedules for ETLs they can access
        return ETLSchedule.objects.select_related("etl").filter(
            etl__is_active=True, etl__is_validated=True
        ).order_by("-created_at")

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def toggle(self, request, pk=None):
        schedule: ETLSchedule = self.get_object()
        schedule.is_active = not schedule.is_active
        schedule.save(update_fields=["is_active"])
        return Response(ETLScheduleSerializer(schedule).data)