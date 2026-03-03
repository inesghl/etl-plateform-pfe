import os

from django.conf import settings
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


from ..accounts.permissions import IsAdmin, IsAdminOrReadOnly
from .models import ETL
from .serializers import (
   ETLSerializer,

)




class ETLViewSet(viewsets.ModelViewSet):
   """
   Basic API for managing ETL definitions.




   For now this allows:
   - Admins: list, create (upload zip), update, delete
   - Authenticated users: read-only access to validated & active ETLs
   """




   queryset = ETL.objects.all().order_by("-created_at")
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
           ETL.objects.filter(is_active=True, is_validated=True).order_by(
               "-created_at"
           )
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
       etl: ETL = serializer.save(created_by=self.request.user)


       # After saving, extract the zip into MEDIA_ROOT/extracted/<etl_id>
       extracted_root = settings.MEDIA_ROOT / "extracted" / str(etl.id)
       os.makedirs(extracted_root, exist_ok=True)


       import zipfile
       import json as _json


       with zipfile.ZipFile(etl.zip_file.path, "r") as zf:
           zf.extractall(extracted_root)


       etl.extracted_path = str(extracted_root)


       # Try to load config.json from the extracted folder
       config_path = extracted_root / "config.json"
       if config_path.exists():
           try:
               with config_path.open("r", encoding="utf-8") as f:
                   etl.config = _json.load(f)
           except Exception as cfg_err:  # keep it simple, store error for admin
               etl.validation_errors = [f"Failed to parse config.json: {cfg_err}"]


       etl.save(update_fields=["extracted_path", "config", "validation_errors"])


   @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
   def validate(self, request, pk=None):
       """
       Mark an ETL as validated.


       The full static validation pipeline (checking files inside the zip,
       parsing config.json, scanning requirements.txt, etc.) should be
       implemented in a dedicated service and invoked from here.
       For now, this simply flips the flag and clears previous errors.
       """
       etl: ETL = self.get_object()
       etl.is_validated = True
       etl.validation_errors = []
       etl.save(update_fields=["is_validated", "validation_errors"])
       return Response(ETLSerializer(etl).data)


   @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
   def activate(self, request, pk=None):
       """
       Activate an ETL so that users can see and use it.
       """
       etl: ETL = self.get_object()
       if not etl.is_validated:
           return Response(
               {"detail": "ETL must be validated before activation."},
               status=status.HTTP_400_BAD_REQUEST,
           )
       etl.is_active = True
       etl.save(update_fields=["is_active"])
       return Response(ETLSerializer(etl).data)





