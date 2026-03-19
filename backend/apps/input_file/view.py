from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import InputFile
from .serializers import InputFileSerializer


class InputFileViewSet(viewsets.ModelViewSet):
    serializer_class = InputFileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'is_admin') and user.is_admin:
            return InputFile.objects.select_related('execution', 'execution__etl').all()
        return InputFile.objects.filter(execution__launched_by=user).select_related('execution', 'execution__etl')

    def create(self, request, *args, **kwargs):
        """Handle file upload with automatic replacement"""

        # Extract data BEFORE validation
        execution_id = request.data.get('execution')
        file_key = request.data.get('file_key')

        # ✅ DELETE old files BEFORE creating new one
        if execution_id and file_key:
            old_files = InputFile.objects.filter(
                execution_id=execution_id,
                file_key=file_key
            )

            for old_file in old_files:
                print(f"[INPUT_FILE] Deleting old file: {old_file.original_filename}")
                if old_file.uploaded_file:
                    old_file.uploaded_file.delete(save=False)
                old_file.delete()

        # Now proceed with normal creation
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        """Set additional fields on creation"""
        file = self.request.FILES.get('uploaded_file')

        serializer.save(
            uploaded_by=self.request.user,
            original_filename=file.name,
            file_size=file.size,
        )

        print(f"[INPUT_FILE] ✓ Uploaded: {file.name} (key: {serializer.instance.file_key})")