"""
execution/views.py
──────────────────
ExecutionViewSet — uses shared path_utils for all path logic.

Fixes applied:
  1. download_output() now looks up the OutputFile record and serves
     file_path directly, instead of re-resolving config paths against
     extracted_path (which is stale after a run). Also tracks download_count.
  2. save_path_classifications() sets status = VALIDATED when all inputs
     are accessible, making the status machine meaningful.
  3. launch() and update_config() guards updated to accept both PENDING
     and VALIDATED as valid pre-launch statuses.
"""

import os
from pathlib import Path

from django.http import FileResponse, Http404
from django.conf import settings
from django.utils import timezone as tz
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..accounts.permissions import IsAdmin
from .models import Execution
from ..etl.models import ETL
from .services.execution_engine import run_execution
from .serializers import ExecutionSerializer
from ..common.path_utils import (
    get_path_like_keys,
    resolve_path,
    resolve_config_key,
    check_one_path,
)


class ExecutionViewSet(viewsets.ModelViewSet):
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
        etl: ETL = serializer.validated_data["etl"]
        if not etl.is_active or not etl.is_validated:
            raise serializers.ValidationError(
                {"etl": ["ETL must be validated and active."]}
            )

        execution = serializer.save(
            launched_by=self.request.user,
            status="PENDING",
            execution_config=dict(etl.config),
        )

        work_dir = Path(settings.MEDIA_ROOT) / "executions" / str(execution.id)
        execution.work_dir = str(work_dir)
        execution.runtime_config = {
            "etl_id": str(etl.id),
            "execution_id": str(execution.id),
            "entry_point": etl.entry_point,
        }
        execution.save(update_fields=["work_dir", "runtime_config", "execution_config"])

    # ── prepare ──────────────────────────────────────────────────────

    @action(detail=True, methods=["get"])
    def prepare(self, request, pk=None):
        """
        Return config + detected path-like keys so the frontend can show
        the classify step. Read-only — no writes.
        """
        execution: Execution = self.get_object()
        execution.refresh_from_db()
        etl = execution.etl

        effective_config = execution.execution_config or dict(etl.config)
        path_like = get_path_like_keys(effective_config)

        merged_classifications = {
            **etl.path_classifications,
            **execution.path_classifications,
        }

        return Response({
            "execution_id": str(execution.id),
            "status": execution.status,
            "etl_name": etl.name,
            "entry_point": etl.entry_point,
            "python_version": etl.python_version,
            "config_file_path": etl.config_file_path,
            "etl_config": etl.config,
            "execution_config": effective_config,
            "config_overrides": execution.config_overrides,
            "output_delivery": execution.output_delivery,
            "notify_email": execution.notify_email,
            "path_like_keys": path_like,
            "path_classifications": merged_classifications,
            "config_diff": _compute_config_diff(etl.config, effective_config),
        })

    # ── update_config ─────────────────────────────────────────────────

    @action(detail=True, methods=["patch"])
    def update_config(self, request, pk=None):
        """Merge user overrides into execution_config."""
        execution: Execution = self.get_object()

        # Allow update when PENDING or VALIDATED (user may tweak config after
        # path check but before launch)
        if execution.status not in ("PENDING", "VALIDATED"):
            return Response(
                {"detail": "Cannot update config after launch."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        overrides = request.data.get("overrides", {})
        if not isinstance(overrides, dict):
            return Response(
                {"detail": "overrides must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_delivery = request.data.get("output_delivery", execution.output_delivery)
        notify_email = request.data.get("notify_email", execution.notify_email)

        if output_delivery not in ("app", "email", "both"):
            return Response(
                {"detail": "output_delivery must be one of: app, email, both."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_config = dict(execution.etl.config)
        merged = {**base_config, **overrides}

        # If the user changes config after validation, reset to PENDING so
        # they must re-check paths with the new values.
        new_status = "PENDING" if execution.status == "VALIDATED" else execution.status

        execution.execution_config = merged
        execution.config_overrides = overrides
        execution.output_delivery = output_delivery
        execution.notify_email = notify_email
        execution.status = new_status
        execution.save(update_fields=[
            "execution_config", "config_overrides",
            "output_delivery", "notify_email", "status",
        ])

        data = ExecutionSerializer(execution).data
        data["path_like_keys"] = get_path_like_keys(merged)
        data["path_classifications"] = {
            **execution.etl.path_classifications,
            **execution.path_classifications,
        }
        data["config_diff"] = _compute_config_diff(execution.etl.config, merged)
        return Response(data)

    # ── save_path_classifications ─────────────────────────────────────

    @action(detail=True, methods=["post"])
    def save_path_classifications(self, request, pk=None):
        """
        Store user-chosen path classifications on the execution.
        Optionally promotes them to the ETL base (if save_to_etl=true, admin only).
        Returns path-check results immediately.

        If all input paths are accessible, sets status = VALIDATED so the
        frontend can enable the Launch button with confidence.
        """
        execution: Execution = self.get_object()
        execution.refresh_from_db()
        etl = execution.etl

        classifications: dict = request.data.get("classifications", {})
        save_to_etl: bool = bool(request.data.get("save_to_etl", False))

        if not isinstance(classifications, dict):
            return Response(
                {"detail": "classifications must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid = {"input", "output", "skip"}
        bad = [k for k, v in classifications.items() if v not in valid]
        if bad:
            return Response(
                {"detail": f"Invalid values for keys {bad}. Use: input, output, skip."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        execution.path_classifications = classifications
        execution.save(update_fields=["path_classifications"])

        # Optionally promote to ETL-level defaults (admin only, skip values excluded)
        if save_to_etl and hasattr(request.user, "is_admin") and request.user.is_admin:
            etl_classifications = {k: v for k, v in classifications.items() if v != "skip"}
            etl.path_classifications = {**etl.path_classifications, **etl_classifications}
            etl.save(update_fields=["path_classifications"])

        # Run path checks with the new classifications
        result = _run_path_checks(execution)

        # Advance status to VALIDATED when all inputs are accessible
        # This makes the status machine meaningful and lets the frontend
        # enable the Launch button without a separate check_paths call.
        if result["inputs_accessible"] and execution.status == "PENDING":
            execution.status = "VALIDATED"
            execution.save(update_fields=["status"])

        result["status"] = execution.status
        return Response(result)

    # ── check_paths ───────────────────────────────────────────────────

    @action(detail=True, methods=["get"])
    def check_paths(self, request, pk=None):
        """Re-check accessibility of all classified paths."""
        execution: Execution = self.get_object()
        execution.refresh_from_db()
        result = _run_path_checks(execution)
        result["status"] = execution.status
        return Response(result)

    # ── launch ────────────────────────────────────────────────────────

    @action(detail=True, methods=["post"])
    def launch(self, request, pk=None):
        execution: Execution = self.get_object()
        etl = execution.etl

        # Accept both PENDING and VALIDATED as valid pre-launch states
        if execution.status not in ("PENDING", "VALIDATED"):
            return Response(
                {"detail": f"Cannot launch — execution is already {execution.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Allow last-minute overrides via the launch request body (optional)
        overrides = request.data.get("overrides")
        if overrides is not None:
            if not isinstance(overrides, dict):
                return Response(
                    {"detail": "overrides must be a JSON object."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            execution.execution_config = {**dict(etl.config), **overrides}
            execution.config_overrides = overrides

        if "output_delivery" in request.data:
            execution.output_delivery = request.data["output_delivery"]
        if "notify_email" in request.data:
            execution.notify_email = request.data["notify_email"]

        execution.save(update_fields=[
            "execution_config", "config_overrides", "output_delivery", "notify_email",
        ])

        run_execution(execution)
        execution.refresh_from_db()
        return Response(ExecutionSerializer(execution).data)

    # ── send_report ───────────────────────────────────────────────────

    @action(detail=True, methods=["post"])
    def send_report(self, request, pk=None):
        execution: Execution = self.get_object()

        if execution.status not in ("SUCCESS", "FAILED"):
            return Response(
                {"detail": "Report can only be sent for completed executions."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = request.data.get("email", "").strip() or execution.notify_email
        if not email:
            return Response(
                {"detail": "No email address provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from ..notification.services.email_service import send_execution_report
            send_execution_report(execution, recipient=email)
            execution.report_sent = True
            execution.report_sent_at = tz.now()
            execution.notify_email = email
            execution.save(update_fields=["report_sent", "report_sent_at", "notify_email"])
            return Response({"detail": f"Report sent to {email}."})
        except Exception as e:
            return Response(
                {"detail": f"Failed to send email: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ── download_output ───────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path=r"download-output/(?P<filename>.+)")
    def download_output(self, request, pk=None, filename=None):
        """
        Serve an output file by filename.

        Uses the OutputFile record (populated by _collect_outputs after the run)
        to find the file's absolute path on disk. This is reliable because
        OutputFile.file_path is the actual location where _collect_outputs found
        the file — not a re-resolved config path which may differ from where the
        script actually wrote.
        """
        execution: Execution = self.get_object()

        try:
            output = execution.output_files.get(filename=filename)
        except Exception:
            raise Http404(f"Output file '{filename}' not found for this execution.")

        file_path = Path(output.file_path)
        if not file_path.exists():
            raise Http404(f"Output file '{filename}' no longer exists on disk.")

        # Track download metrics
        output.download_count += 1
        output.last_downloaded_at = tz.now()
        output.save(update_fields=["download_count", "last_downloaded_at"])

        return FileResponse(
            open(file_path, "rb"),
            as_attachment=True,
            filename=filename,
        )

    # ── available_inputs (post-run viewer) ────────────────────────────

    @action(detail=True, methods=["get"])
    def available_inputs(self, request, pk=None):
        """Show path accessibility info — works both pre and post launch."""
        execution: Execution = self.get_object()
        execution.refresh_from_db()
        return Response(_run_path_checks(execution))


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _run_path_checks(execution: Execution) -> dict:
    """
    Check accessibility of all classified paths.

    Resolution order for relative paths:
      1. work_dir/etl_code/<relative>  — runtime location (post-launch)
      2. extracted_path/<relative>     — original ZIP location (pre-launch)
    """
    etl = execution.etl
    effective_config = execution.execution_config or dict(etl.config)
    classifications = {**etl.path_classifications, **execution.path_classifications}

    all_path_keys = get_path_like_keys(effective_config)
    unclassified = [k for k in all_path_keys if k not in classifications]

    inputs, outputs, others = [], [], []

    for config_key, classification in classifications.items():
        if classification == "skip":
            continue
        entry = check_one_path(
            config_key,
            classification,
            effective_config,
            etl.extracted_path,
            work_dir=execution.work_dir or "",
        )
        if classification == "input":
            inputs.append(entry)
        elif classification == "output":
            outputs.append(entry)
        else:
            others.append(entry)

    inputs_missing = [e["config_key"] for e in inputs if not e["accessible"]]

    return {
        "mode": "config_driven",
        "inputs": inputs,
        "outputs": outputs,
        "other": others,
        "inputs_accessible": len(inputs_missing) == 0,
        "inputs_missing": inputs_missing,
        "unclassified_path_keys": unclassified,
        "config_used": effective_config,
    }


def _compute_config_diff(base: dict, current: dict) -> dict:
    """Return keys that differ between the base ETL config and the current execution config."""
    diff = {}
    all_keys = set(base) | set(current)
    for k in all_keys:
        base_val = base.get(k)
        curr_val = current.get(k)
        if base_val != curr_val:
            diff[k] = {"from": base_val, "to": curr_val}
    return diff