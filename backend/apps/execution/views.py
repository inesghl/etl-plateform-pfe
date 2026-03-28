
import os
from pathlib import Path
from django.http import FileResponse, Http404

from django.conf import settings
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..accounts.permissions import IsAdmin, IsAdminOrReadOnly
from .models import Execution
from ..etl.models import ETL
from .services.execution_engine import run_execution
from .serializers import (
    ExecutionSerializer,
)


class ExecutionViewSet(viewsets.ModelViewSet):
    """
    API for creating and monitoring ETL executions.

    - Any authenticated user can create an execution for a validated & active ETL.
    - Admins can see every execution.
    - Normal users only see their own executions.
    """

    serializer_class = ExecutionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, "is_admin") and user.is_admin:
            return Execution.objects.select_related("etl", "launched_by").all()
        return Execution.objects.select_related("etl", "launched_by").filter(
            launched_by=user
        )

    def perform_create(self, serializer):
        """
        Create a new execution in PENDING status and pre-compute
        the work_dir and initial runtime_config.
        """
        etl: ETL = serializer.validated_data["etl"]

        if not etl.is_active or not etl.is_validated:
            raise serializers.ValidationError(
                {"etl": ["ETL must be validated and active to launch executions."]}
            )

        # Workspace under MEDIA_ROOT/executions/<uuid>
        execution = serializer.save(
            launched_by=self.request.user,
            status="PENDING",
        )

        work_dir = settings.MEDIA_ROOT / "executions" / str(execution.id)
        execution.work_dir = str(work_dir)

        # Store a minimal runtime_config snapshot now; the engine can enrich it later.
        execution.runtime_config = {
            "etl_id": str(etl.id),
            "execution_id": str(execution.id),
            "entry_point": etl.entry_point,
            "expected_outputs": etl.expected_outputs,
            "input_requirements": etl.input_requirements,
        }
        execution.save(update_fields=["runtime_config"])

    @action(detail=True, methods=["post"])
    def launch(self, request, pk=None):
        """
        Trigger the execution.

        """
        execution: Execution = self.get_object()
        etl = execution.etl
        """  prevent rerun for now  """
       #
        # Basic guards
        if execution.status not in ("PENDING", "VALIDATED"):
            return Response(
                {"detail": f"Execution is already in status {execution.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate that required inputs exist
        missing_required = []
        requirements = etl.input_requirements
        existing_keys = set(
            execution.input_files.values_list("file_key", flat=True)
        )
        for key, spec in requirements.items():
            files_count = execution.input_files.filter(file_key=key).count()

            if spec.get("required", False) and files_count == 0:
                missing_required.append(key)

        if missing_required:
            execution.status = "VALIDATION_FAILED"
            execution.error_message = (
                f"Missing required inputs: {', '.join(missing_required)}"
            )
            execution.save(update_fields=["status", "error_message"])
            return Response(
                {
                    "detail": "Missing required inputs.",
                    "missing_inputs": missing_required,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Run the full execution pipeline synchronously.
        run_execution(execution)

        # Reload to reflect all updated fields
        execution.refresh_from_db()
        return Response(ExecutionSerializer(execution).data)

    @action(detail=True, methods=["get"])
    def available_inputs(self, request, pk=None):
        """
        Get all available inputs for this execution:
        1. Default inputs from ETL's data/ folder (if any)
        2. User-uploaded inputs
        3. Required inputs from ETL config

        Returns structure showing what's available vs what's needed.
        """
        execution: Execution = self.get_object()
        etl = execution.etl

        # Get required inputs from ETL config
        input_requirements = etl.input_requirements or {}

        # Get user-uploaded inputs
        from ..input_file.serializers import InputFileSerializer
        user_uploads = InputFileSerializer(
            execution.input_files.all(),
            many=True,
            context={'request': request}
        ).data

        # Find default inputs in ETL's data/ folder
        default_inputs = []
        extracted_path = Path(etl.extracted_path)

        for folder in extracted_path.rglob("data"):
            if folder.is_dir():
                for file in folder.iterdir():
                    if file.is_file() and file.suffix.lower() in {'.xlsx', '.xls', '.csv', '.json'}:
                        default_inputs.append({
                            'filename': file.name,
                            'file_path': str(file),
                            'file_size': file.stat().st_size,
                            'is_default': True,
                        })

        # Build response showing requirements vs availability
        inputs_status = {}

        for key, spec in input_requirements.items():
            # Check if user uploaded this input
            user_uploads_for_key = [u for u in user_uploads if u['file_key'] == key]
            # Check if default exists matching the key
            default_file = next((d for d in default_inputs if key.lower() in d['filename'].lower()), None)

            inputs_status[key] = {
                'required': spec.get('required', False),
                'description': spec.get('description', ''),
                'extensions': spec.get('extensions', []),
                'user_uploads': user_uploads_for_key,
                'default_available': default_file,
                'status': 'uploaded' if user_uploads_for_key else ('default' if default_file else 'missing') }

        return Response({
            'input_requirements': input_requirements,
            'inputs_status': inputs_status,
            'user_uploads': user_uploads,
            'default_inputs': default_inputs,
        })


    @action(detail=True, methods=["get"], url_path=r'download-default-input/(?P<filename>.+)')
    def download_default_input(self, request, pk=None, filename=None):
        """
        Download a default input file from the ETL's data folder.
        """
        execution: Execution = self.get_object()
        etl = execution.etl

        # Find the file in ETL's data folder
        extracted_path = Path(etl.extracted_path)

        if not extracted_path.exists():
            raise Http404("ETL files not found")

        # Search for the file in data folders
        target_file = None
        for data_folder in extracted_path.rglob("data"):
            if data_folder.is_dir():
                for file in data_folder.iterdir():
                    if file.is_file() and file.name == filename:
                        target_file = file
                        break
            if target_file:
                break

        if not target_file or not target_file.exists():
            raise Http404(f"File '{filename}' not found in ETL")

        # Serve the file
        response = FileResponse(
            open(target_file, 'rb'),
            as_attachment=True,
            filename=filename
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response