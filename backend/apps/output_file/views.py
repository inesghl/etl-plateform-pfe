import os
from django.http import FileResponse, Http404
from rest_framework.decorators import action
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import OutputFile
from ..execution.models import Execution
from ..notification.models import Notification
from .serializers import OutputFileSerializer
from ..notification.serializers import NotificationSerializer


class OutputFileViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for output files.
    """
    serializer_class = OutputFileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = OutputFile.objects.select_related("execution")

        # ✅ FIX: Filter by execution_id if provided in query params
        execution_id = self.request.query_params.get('execution')
        if execution_id:
            qs = qs.filter(execution_id=execution_id)

        # Admin sees all, users see only their own
        if hasattr(user, "is_admin") and user.is_admin:
            return qs.all()
        return qs.filter(execution__launched_by=user)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """
        Download the physical output file.
        """
        output: OutputFile = self.get_object()

        if not os.path.exists(output.file_path):
            raise Http404("File not found on disk.")

        try:
            response = FileResponse(
                open(output.file_path, "rb"),
                as_attachment=True,
                filename=output.filename
            )
            response['Content-Disposition'] = f'attachment; filename="{output.filename}"'
        except FileNotFoundError:
            raise Http404("File not found on disk.")

        # Increment download counters
        from django.utils import timezone
        output.download_count += 1
        output.last_downloaded_at = timezone.now()
        output.save(update_fields=["download_count", "last_downloaded_at"])

        return response


class NotificationViewSet(viewsets.ModelViewSet):
    """
    User notifications (validation results, failures, completion, etc.).
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)