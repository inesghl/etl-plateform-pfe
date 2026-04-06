"""
notification/views.py
"""
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    execution_id = serializers.SerializerMethodField()

    class Meta:
        model  = Notification
        fields = [
            "id", "title", "message", "notification_type",
            "is_read", "created_at", "execution_id",
        ]

    def get_execution_id(self, obj):
        return str(obj.execution_id) if obj.execution_id else None


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class   = NotificationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names  = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # Each user sees their own + any broadcast (user=None) notifications
        user = self.request.user
        from django.db.models import Q
        return Notification.objects.filter(
            Q(user=user) | Q(user__isnull=True)
        ).order_by("-created_at")

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"marked_read": updated})

    @action(detail=True, methods=["patch"])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notif).data)