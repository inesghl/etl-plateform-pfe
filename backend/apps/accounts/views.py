# accounts/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import User, UserGroup
from .serializers import UserSerializer, UserRegistrationSerializer, UserGroupSerializer
from ..accounts.permissions import IsAdmin


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def register(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def me(self, request):
        return Response(UserSerializer(request.user).data)


class UserGroupViewSet(viewsets.ModelViewSet):
    """
    Admin-only CRUD for user groups.
  
    """
    queryset = UserGroup.objects.prefetch_related('members').all()
    serializer_class = UserGroupSerializer
    permission_classes = [IsAuthenticated, IsAdmin]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def add_members(self, request, pk=None):
        group: UserGroup = self.get_object()
        user_ids = request.data.get('user_ids', [])
        users = User.objects.filter(id__in=user_ids)
        group.members.add(*users)
        return Response(UserGroupSerializer(group).data)

    @action(detail=True, methods=['post'])
    def remove_members(self, request, pk=None):
        group: UserGroup = self.get_object()
        user_ids = request.data.get('user_ids', [])
        users = User.objects.filter(id__in=user_ids)
        group.members.remove(*users)
        return Response(UserGroupSerializer(group).data)