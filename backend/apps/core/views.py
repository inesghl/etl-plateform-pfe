import os


from django.conf import settings
from rest_framework import serializers, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..accounts.permissions import IsAdminOrReadOnly
from .models import ETL
from .serializers import ETLSerializer




class ETLViewSet(viewsets.ModelViewSet):
    """
    Basic API for managing ETL definitions.


    For now this allows:
    - Admins: list, create (upload zip), update, delete
    - Authenticated users: read-only access to validated & active ETLs
    """


    queryset = ETL.objects.all().order_by('-created_at')
    serializer_class = ETLSerializer
    # Authentication + role-based permissions:
    # - Any authenticated user can read ETLs
    # - Only admins (role=admin or superuser) can create/update/delete
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]


    def get_queryset(self):
        user = self.request.user


        # Admins see everything
        if hasattr(user, "is_admin") and user.is_admin:
            return ETL.objects.all().order_by("-created_at")


        # Normal users see only validated & active ETLs
        return (
            ETL.objects.filter(is_active=True, is_validated=True)
            .order_by("-created_at")
        )


    def perform_create(self, serializer):
        """
        Attach creator and do a very light validation on the uploaded file.
        Full validation pipeline will be implemented later.
        """
        zip_file = self.request.FILES.get("zip_file")


        if not zip_file:
            raise serializers.ValidationError(
                {"zip_file": ["This field is required."]}
            )


        # Simple safety check: only allow .zip files
        _, ext = os.path.splitext(zip_file.name)
        if ext.lower() != ".zip":
            raise serializers.ValidationError(
                {"zip_file": ["Only .zip files are allowed."]}
            )


        # Enforce max upload size from settings / env
        max_size = int(
            os.getenv("MAX_UPLOAD_SIZE", settings.FILE_UPLOAD_MAX_MEMORY_SIZE)
        )
        if zip_file.size > max_size:
            raise serializers.ValidationError(
                {
                    "zip_file": [
                        f"File too large (>{max_size} bytes). "
                        f"Current size: {zip_file.size} bytes."
                    ]
                }
            )


        serializer.save(created_by=self.request.user)





