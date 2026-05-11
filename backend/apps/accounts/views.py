from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import User, UserGroup
from .serializers import (
    UserSerializer,
    UserRegistrationSerializer,
    UserGroupSerializer,
    UserProfileUpdateSerializer,
    AdminUserUpdateSerializer,
)

from .permissions import IsAdmin


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('username')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    # ------------------------------------------------------------------
    # Permissions
    # ------------------------------------------------------------------

    def get_permissions(self):

        # Public registration
        if self.action == 'register':
            return [AllowAny()]

        # Admin-only actions
        if self.action in [
            'list',
            'create',
            'destroy',
            'toggle_active',
            'set_role',
            'set_password',
        ]:
            return [IsAuthenticated(), IsAdmin()]

        return [IsAuthenticated()]

    # ------------------------------------------------------------------
    # Serializers
    # ------------------------------------------------------------------

    def get_serializer_class(self):

        # Admin creating user
        if self.action == 'create':
            return UserRegistrationSerializer

        # Public registration
        if self.action == 'register':
            return UserRegistrationSerializer

        # Self profile update
        if self.action == 'update_profile':
            return UserProfileUpdateSerializer

        # Admin update
        if self.action in ['update', 'partial_update']:
            if self.request.user.is_admin:
                return AdminUserUpdateSerializer

        return UserSerializer

    # ------------------------------------------------------------------
    # Public registration
    # ------------------------------------------------------------------

    @action(
        detail=False,
        methods=['post'],
        permission_classes=[AllowAny],
    )
    def register(self, request):

        serializer = UserRegistrationSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.save()

            return Response(
                UserSerializer(user).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ------------------------------------------------------------------
    # Current authenticated user
    # ------------------------------------------------------------------

    @action(detail=False, methods=['get'])
    def me(self, request):
        return Response(UserSerializer(request.user).data)

    # ------------------------------------------------------------------
    # Self profile update
    # ------------------------------------------------------------------

    @action(
        detail=False,
        methods=['patch'],
        url_path='me/update',
    )
    def update_profile(self, request):

        serializer = UserProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={'request': request},
        )

        if serializer.is_valid():
            serializer.save()

            return Response(UserSerializer(request.user).data)

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ------------------------------------------------------------------
    # Admin: set password
    # ------------------------------------------------------------------

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def set_password(self, request, pk=None):

        user = self.get_object()

        new_password = request.data.get('password')

        if not new_password or len(new_password) < 8:
            return Response(
                {'error': 'Password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()

        return Response({'detail': 'Password updated.'})

    # ------------------------------------------------------------------
    # Admin: activate/deactivate
    # ------------------------------------------------------------------

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def toggle_active(self, request, pk=None):

        user = self.get_object()

        if user == request.user:
            return Response(
                {'error': 'You cannot deactivate yourself.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = not user.is_active
        user.save()

        return Response(UserSerializer(user).data)

    # ------------------------------------------------------------------
    # Admin: change role
    # ------------------------------------------------------------------

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def set_role(self, request, pk=None):

        user = self.get_object()

        role = request.data.get('role')

        if role not in ['admin', 'user']:
            return Response(
                {'error': 'Role must be admin or user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user == request.user and role == 'user':
            return Response(
                {'error': 'You cannot demote yourself.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.role = role
        user.save()

        return Response(UserSerializer(user).data)


class UserGroupViewSet(viewsets.ModelViewSet):

    queryset = UserGroup.objects.prefetch_related('members').all()

    serializer_class = UserGroupSerializer

    permission_classes = [IsAuthenticated, IsAdmin]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def add_members(self, request, pk=None):

        group = self.get_object()

        user_ids = request.data.get('user_ids', [])

        users = User.objects.filter(id__in=user_ids)

        group.members.add(*users)

        return Response(UserGroupSerializer(group).data)

    @action(detail=True, methods=['post'])
    def remove_members(self, request, pk=None):

        group = self.get_object()

        user_ids = request.data.get('user_ids', [])

        users = User.objects.filter(id__in=user_ids)

        group.members.remove(*users)

        return Response(UserGroupSerializer(group).data)