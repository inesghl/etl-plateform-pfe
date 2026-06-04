# etl/views.py
import os
import shutil
import zipfile
import json as _json
from pathlib import Path

from django.conf import settings
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..accounts.permissions import IsAdmin, IsAdminOrReadOnly
from ..accounts.models import UserGroup, User
from .models import ETL
from .serializers import ETLSerializer
from ..common.path_utils import get_path_like_keys, looks_like_path

EXCLUDED_DIRS = {'.venv', 'venv', '__pycache__', '.git', 'node_modules', '.idea', '.vscode', '.tox'}
CONFIG_EXTENSIONS = {'.json', '.yaml', '.yml', '.toml', '.ini', '.cfg'}


# ── helpers ───────────────────────────────────────────────────────

def _find_file(base: Path, filename: str) -> Path | None:
    matches = [
        f for f in base.rglob(filename)
        if not any(ex in f.parts for ex in EXCLUDED_DIRS) and f.is_file()
    ]
    if not matches:
        return None
    matches.sort(key=lambda p: len(p.parts))
    return matches[0]


def _parse_config(path: Path) -> tuple[dict, str | None]:
    try:
        suffix = path.suffix.lower()
        if suffix == '.toml':
            try:
                import tomllib
            except ImportError:
                import tomli as tomllib
            with open(path, "rb") as f:
                return tomllib.load(f), None
        elif suffix in ('.yaml', '.yml'):
            import yaml
            with open(path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}, None
        elif suffix == '.json':
            with open(path, "r", encoding="utf-8") as f:
                return _json.load(f), None
        elif suffix in ('.ini', '.cfg'):
            import configparser
            cp = configparser.ConfigParser()
            cp.read(str(path), encoding="utf-8")
            result = {}
            for section in cp.sections():
                for key, val in cp.items(section):
                    result[f"{section}.{key}"] = val
            return result, None
        else:
            with open(path, "r", encoding="utf-8") as f:
                return _json.load(f), None
    except Exception as e:
        return {}, str(e)


def _notify_group_members(etl: ETL, groups: list) -> None:
    """Send in-app notifications to all members of newly assigned groups."""
    try:
        from ..notification.models import Notification
        notified_user_ids = set()
        for group in groups:
            for user in group.members.all():
                if user.id not in notified_user_ids:
                    Notification.objects.create(
                        user=user,
                        title=f"New ETL assigned: {etl.name}",
                        message=(
                            f"The ETL \"{etl.name}\" (v{etl.version}) has been assigned to your group "
                            f"\"{group.name}\" and is now available for you to run."
                        ),
                        notification_type="info",
                    )
                    notified_user_ids.add(user.id)
    except Exception as e:
        print(f"[NOTIFY] Failed to send group assignment notifications: {e}")


# ── ViewSet ───────────────────────────────────────────────────────

class ETLViewSet(viewsets.ModelViewSet):
    queryset = ETL.objects.all().order_by("-created_at")
    serializer_class = ETLSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def get_queryset(self):
        """
        Admins see all ETLs.
        Regular users see only active + validated ETLs that are either:
          - unrestricted (no allowed_groups assigned), or
          - restricted to a group the user belongs to.
        """
        from django.db.models import Q
        user = self.request.user
        if hasattr(user, "is_admin") and user.is_admin:
            return ETL.objects.all().order_by("-created_at")

        user_group_ids = list(user.user_groups.values_list('id', flat=True))
        return ETL.objects.filter(
            is_active=True, is_validated=True
        ).filter(
            # Unrestricted (both M2M are empty) OR user has access via group or direct assignment
            Q(allowed_groups__isnull=True, allowed_users__isnull=True)
            | Q(allowed_groups__id__in=user_group_ids)
            | Q(allowed_users=user)
        ).distinct().order_by("-created_at")

    def perform_create(self, serializer):
        zip_file = self.request.FILES.get("zip_file")

        if not zip_file:
            raise serializers.ValidationError({"zip_file": ["This field is required."]})

        _, ext = os.path.splitext(zip_file.name)
        if ext.lower() != ".zip":
            raise serializers.ValidationError({"zip_file": ["Only .zip files are allowed."]})

        max_size = int(os.getenv("MAX_UPLOAD_SIZE", settings.FILE_UPLOAD_MAX_MEMORY_SIZE))
        if zip_file.size > max_size:
            raise serializers.ValidationError({
                "zip_file": [f"File too large (>{max_size} bytes). Current: {zip_file.size} bytes."]
            })

        entry_point_filename = self.request.data.get("entry_point_path", "").strip()
        if not entry_point_filename:
            raise serializers.ValidationError(
                {"entry_point_path": ["Entry point filename is required (e.g. main.py)."]}
            )

        etl: ETL = serializer.save(created_by=self.request.user)

        extracted_root = Path(settings.MEDIA_ROOT) / "extracted" / str(etl.id)
        extracted_root.mkdir(parents=True, exist_ok=True)

        try:
            self._safe_extract_zip(etl.zip_file.path, extracted_root)
            etl.extracted_path = str(extracted_root)
            etl.save(update_fields=["extracted_path"])
        except Exception as e:
            etl.delete()
            raise serializers.ValidationError({"zip_file": [f"Extraction failed: {str(e)}"]})

        warnings = []

        ep = _find_file(extracted_root, etl.entry_point_path)
        if ep:
            etl.resolved_entry_point = str(ep)
        else:
            warnings.append(f"Entry point '{etl.entry_point_path}' not found in ZIP.")

        if etl.config_file_path:
            cf = _find_file(extracted_root, etl.config_file_path)
            if cf:
                etl.resolved_config_file = str(cf)
                parsed, err = _parse_config(cf)
                if err:
                    warnings.append(f"Config found but could not be parsed: {err}")
                else:
                    etl.config = parsed
            else:
                warnings.append(f"Config file '{etl.config_file_path}' not found in ZIP.")

        if etl.requirements_path:
            rp = _find_file(extracted_root, etl.requirements_path)
            if rp:
                etl.resolved_requirements = str(rp)
            else:
                warnings.append(f"Requirements '{etl.requirements_path}' not found in ZIP.")

        etl.validation_errors = warnings
        etl.save(update_fields=[
            "resolved_entry_point", "resolved_config_file", "resolved_requirements",
            "config", "validation_errors",
        ])

    def _safe_extract_zip(self, zip_path, extract_to):
        SKIP_PATTERNS = [
            '.venv', 'venv', '__pycache__', '.git', '.idea', '.vscode',
            'node_modules', '.DS_Store', 'Thumbs.db',
        ]
        with zipfile.ZipFile(zip_path, 'r') as zf:
            for member in zf.namelist():
                if member.startswith('/') or '..' in member:
                    continue
                if any(p in member for p in SKIP_PATTERNS):
                    continue
                if len(str(extract_to / member)) > 200:
                    continue
                try:
                    zf.extract(member, extract_to)
                except Exception as e:
                    print(f"Warning: Could not extract {member}: {e}")

    # ── edit (admin) ──────────────────────────────────────────────

    @action(detail=True, methods=["patch"], permission_classes=[IsAuthenticated, IsAdmin])
    def edit(self, request, pk=None):
        """
        Update editable ETL metadata. Optionally re-upload a new ZIP file.
        If a new zip_file is provided, the old extraction is replaced and
        paths are re-resolved (entry point, config, requirements).
        """
        etl: ETL = self.get_object()
        allowed_fields = {
            'name', 'description', 'version',
            'entry_point_path', 'config_file_path',
            'requirements_path', 'python_version',
        }
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        serializer = ETLSerializer(etl, data=data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()

        zip_file = request.FILES.get("zip_file")
        if zip_file:
            _, ext = os.path.splitext(zip_file.name)
            if ext.lower() != ".zip":
                return Response(
                    {"detail": "Only .zip files are allowed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            max_size = int(os.getenv("MAX_UPLOAD_SIZE", settings.FILE_UPLOAD_MAX_MEMORY_SIZE))
            if zip_file.size > max_size:
                return Response(
                    {"detail": f"File too large (>{max_size} bytes). Current: {zip_file.size} bytes."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Remove old extracted directory
            if etl.extracted_path:
                old_extracted = Path(etl.extracted_path)
                if old_extracted.exists():
                    shutil.rmtree(old_extracted, ignore_errors=True)

            # Replace the zip_file field on the model
            etl.zip_file = zip_file
            etl.save(update_fields=["zip_file"])

            # Re-extract
            extracted_root = Path(settings.MEDIA_ROOT) / "extracted" / str(etl.id)
            extracted_root.mkdir(parents=True, exist_ok=True)
            try:
                self._safe_extract_zip(etl.zip_file.path, extracted_root)
            except Exception as e:
                return Response(
                    {"detail": f"Extraction failed: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            etl.extracted_path = str(extracted_root)

            # Reset resolved paths and validation state
            etl.is_validated = False
            etl.resolved_entry_point = ""
            etl.resolved_config_file = ""
            etl.resolved_requirements = ""
            etl.config = {}
            warnings = []

            ep = _find_file(extracted_root, etl.entry_point_path)
            if ep:
                etl.resolved_entry_point = str(ep)
            else:
                warnings.append(f"Entry point '{etl.entry_point_path}' not found in ZIP.")

            if etl.config_file_path:
                cf = _find_file(extracted_root, etl.config_file_path)
                if cf:
                    etl.resolved_config_file = str(cf)
                    parsed, err = _parse_config(cf)
                    if err:
                        warnings.append(f"Config found but could not be parsed: {err}")
                    else:
                        etl.config = parsed
                else:
                    warnings.append(f"Config file '{etl.config_file_path}' not found in ZIP.")

            if etl.requirements_path:
                rp = _find_file(extracted_root, etl.requirements_path)
                if rp:
                    etl.resolved_requirements = str(rp)
                else:
                    warnings.append(f"Requirements '{etl.requirements_path}' not found in ZIP.")

            etl.validation_errors = warnings
            etl.save(update_fields=[
                "extracted_path", "is_validated", "validation_errors",
                "resolved_entry_point", "resolved_config_file",
                "resolved_requirements", "config",
            ])

        return Response(ETLSerializer(etl, context={'request': request}).data)

    # ── assign_groups (admin) ─────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def assign_groups(self, request, pk=None):
        """
        Set which groups can access this ETL.
        Body: { "group_ids": ["uuid1", "uuid2", ...] }
        Pass an empty list to make it accessible to everyone.
        Sends in-app notifications to members of newly added groups.
        """
        etl: ETL = self.get_object()
        group_ids = request.data.get("group_ids", [])
        new_groups = list(UserGroup.objects.filter(id__in=group_ids))

        existing_ids = set(etl.allowed_groups.values_list('id', flat=True))
        newly_added = [g for g in new_groups if g.id not in existing_ids]

        etl.allowed_groups.set(new_groups)

        if newly_added:
            _notify_group_members(etl, newly_added)

        return Response(ETLSerializer(etl, context={'request': request}).data)

    # ── assign_users (admin) ──────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def assign_users(self, request, pk=None):
        """
        Set which individual users can access this ETL.
        Body: { "user_ids": [1, 2, ...] }
        Pass an empty list to remove all individual-user restrictions.
        """
        etl: ETL = self.get_object()
        user_ids = request.data.get("user_ids", [])
        new_users = list(User.objects.filter(id__in=user_ids))
        etl.allowed_users.set(new_users)
        return Response(ETLSerializer(etl, context={'request': request}).data)

    # ── read_config ───────────────────────────────────────────────

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated, IsAdmin])
    def read_config(self, request, pk=None):
        etl: ETL = self.get_object()
        if not etl.resolved_config_file:
            return Response(
                {"detail": "No config file resolved."},
                status=status.HTTP_404_NOT_FOUND,
            )
        cf = Path(etl.resolved_config_file)
        if not cf.exists():
            return Response(
                {"detail": "Config file not found on disk."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            raw = cf.read_text(encoding="utf-8")
        except Exception as e:
            raw = f"Could not read: {e}"
        return Response({
            "config_file_path": etl.config_file_path,
            "resolved_path": etl.resolved_config_file,
            "parsed": etl.config,
            "raw": raw,
            "path_like_keys": get_path_like_keys(etl.config),
            "current_classifications": etl.path_classifications,
        })

    # ── update_base_config ────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def update_base_config(self, request, pk=None):
        etl: ETL = self.get_object()
        incoming = request.data.get("config")
        if not isinstance(incoming, dict) or not incoming:
            return Response(
                {"detail": "Body must contain a non-empty 'config' object."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated_config = {**etl.config, **incoming}
        etl.config = updated_config
        etl.save(update_fields=["config"])
        _write_back_config(etl, incoming)
        return Response({
            **ETLSerializer(etl, context={'request': request}).data,
            "updated_keys": list(incoming.keys()),
            "path_like_keys": get_path_like_keys(updated_config),
        })

    # ── classify_paths ────────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def classify_paths(self, request, pk=None):
        etl: ETL = self.get_object()
        classifications = request.data.get("classifications", {})
        if not isinstance(classifications, dict):
            return Response(
                {"detail": "classifications must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        valid_types = {"input", "output", "other"}
        bad = [k for k, v in classifications.items() if v not in valid_types]
        if bad:
            return Response(
                {"detail": f"Invalid classification type for keys: {bad}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        etl.path_classifications = classifications
        etl.save(update_fields=["path_classifications"])
        return Response({"path_classifications": etl.path_classifications, "detail": "Saved."})

    # ── validate ──────────────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def validate(self, request, pk=None):
        etl: ETL = self.get_object()
        errors, warnings, info = [], [], {}

        if not etl.extracted_path or not Path(etl.extracted_path).exists():
            return Response(
                {"detail": "ETL not extracted yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        extracted = Path(etl.extracted_path)

        if not etl.entry_point_path:
            errors.append("No entry point filename configured.")
        else:
            ep = _find_file(extracted, etl.entry_point_path)
            if not ep:
                errors.append(f"Entry point '{etl.entry_point_path}' not found.")
            else:
                etl.resolved_entry_point = str(ep)
                info["entry_point"] = str(ep.relative_to(extracted))

        if etl.config_file_path:
            cf = _find_file(extracted, etl.config_file_path)
            if not cf:
                errors.append(f"Config file '{etl.config_file_path}' not found.")
            else:
                etl.resolved_config_file = str(cf)
                parsed, parse_err = _parse_config(cf)
                if parse_err:
                    errors.append(f"Config file invalid: {parse_err}")
                else:
                    etl.config = parsed
                    info["config_file"] = str(cf.relative_to(extracted))
                    path_like = get_path_like_keys(parsed)
                    info["path_like_keys_found"] = len(path_like)
                    for key, val in path_like.items():
                        if not Path(val).exists():
                            warnings.append(f"Path '{val}' (key: {key}) is not accessible.")
                    unclassified = [k for k in path_like if k not in etl.path_classifications]
                    if unclassified:
                        warnings.append(f"{len(unclassified)} path(s) not yet classified.")
        else:
            warnings.append("No config file configured.")

        if etl.requirements_path:
            rp = _find_file(extracted, etl.requirements_path)
            if not rp:
                errors.append(f"Requirements '{etl.requirements_path}' not found.")
            else:
                etl.resolved_requirements = str(rp)
                info["requirements"] = str(rp.relative_to(extracted))
        else:
            warnings.append("No requirements.txt configured.")

        if not etl.python_version:
            warnings.append("No Python version specified — server default will be used.")

        if errors:
            etl.is_validated = False
            etl.validation_errors = errors
            etl.save(update_fields=[
                "is_validated", "validation_errors",
                "resolved_entry_point", "resolved_config_file",
                "resolved_requirements", "config",
            ])
            return Response(
                {"detail": "Validation failed", "errors": errors,
                 "warnings": warnings, "info": info},
                status=status.HTTP_400_BAD_REQUEST,
            )

        etl.is_validated = True
        etl.validation_errors = []
        etl.save(update_fields=[
            "is_validated", "validation_errors",
            "resolved_entry_point", "resolved_config_file",
            "resolved_requirements", "config",
        ])
        data = ETLSerializer(etl, context={'request': request}).data
        data["validation_info"] = {
            "warnings": warnings,
            "info": info,
            "message": "ETL validated successfully",
        }
        return Response(data)

    # ── rebuild_venv ──────────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def rebuild_venv(self, request, pk=None):
        etl: ETL = self.get_object()
        if etl.shared_venv_path:
            p = Path(etl.shared_venv_path)
            if p.exists():
                shutil.rmtree(p, ignore_errors=True)
        etl.shared_venv_path = ""
        etl.deps_installed_at = None
        etl.save(update_fields=["shared_venv_path", "deps_installed_at"])
        return Response({"detail": "Shared venv cleared — will be rebuilt on next execution."})

    # ── activate ──────────────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def activate(self, request, pk=None):
        etl: ETL = self.get_object()
        if not etl.is_validated:
            return Response(
                {"detail": "ETL must be validated before activation."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        etl.is_active = True
        etl.save(update_fields=["is_active"])
        return Response(ETLSerializer(etl, context={'request': request}).data)

    # ── delete ────────────────────────────────────────────────────

    @action(detail=True, methods=["delete"], permission_classes=[IsAuthenticated, IsAdmin])
    def delete(self, request, pk=None):
        etl: ETL = self.get_object()
        if etl.executions.exists():
            return Response(
                {"detail": "Cannot delete ETL with existing executions."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for path_attr in ["shared_venv_path", "extracted_path"]:
            p_str = getattr(etl, path_attr)
            if p_str:
                p = Path(p_str)
                if p.exists():
                    shutil.rmtree(p, ignore_errors=True)
        etl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Disk write-back helper ────────────────────────────────────────

def _write_back_config(etl: ETL, changed_keys: dict) -> None:
    """Write changed config keys back to the config file on disk."""
    if not etl.resolved_config_file:
        return
    cf = Path(etl.resolved_config_file)
    if not cf.exists():
        return
    try:
        suffix = cf.suffix.lower()
        if suffix == ".json":
            with open(cf, "r", encoding="utf-8") as f:
                on_disk = _json.load(f)
            on_disk.update(changed_keys)
            with open(cf, "w", encoding="utf-8") as f:
                _json.dump(on_disk, f, indent=2, ensure_ascii=False)
        elif suffix in (".yaml", ".yml"):
            try:
                import yaml
                with open(cf, "r", encoding="utf-8") as f:
                    on_disk = yaml.safe_load(f) or {}
                on_disk.update(changed_keys)
                with open(cf, "w", encoding="utf-8") as f:
                    yaml.dump(on_disk, f, default_flow_style=False, allow_unicode=True)
            except ImportError:
                _write_sidecar(cf, etl.config)
        else:
            _write_sidecar(cf, etl.config)
    except Exception as e:
        print(f"[CONFIG] Write-back failed (non-fatal): {e}")


def _write_sidecar(original: Path, full_config: dict) -> None:
    sidecar = original.with_suffix(".updated.json")
    with open(sidecar, "w", encoding="utf-8") as f:
        _json.dump(full_config, f, indent=2, ensure_ascii=False)