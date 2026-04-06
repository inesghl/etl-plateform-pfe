"""
etl/views.py  (ETLViewSet)
──────────────────────────
Uses shared path helpers from apps/common/path_utils.py.
"""

import os
import shutil
import zipfile
import json as _json
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..accounts.permissions import IsAdmin, IsAdminOrReadOnly
from .models import ETL
from .serializers import ETLSerializer
from ..common.path_utils import get_path_like_keys, looks_like_path     # ← fixed

EXCLUDED_DIRS = {
    '.venv', 'venv', '__pycache__', '.git',
    'node_modules', '.idea', '.vscode', '.tox',
}
CONFIG_EXTENSIONS = {'.json', '.yaml', '.yml', '.toml', '.ini', '.cfg'}


# ── helpers ───────────────────────────────────────────────────────

def _find_file(base: Path, filename: str) -> Path | None:
    matches = []
    for f in base.rglob(filename):
        if any(ex in f.parts for ex in EXCLUDED_DIRS):
            continue
        if f.is_file():
            matches.append(f)
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


# ── ViewSet ───────────────────────────────────────────────────────

class ETLViewSet(viewsets.ModelViewSet):
    queryset = ETL.objects.all().order_by("-created_at")
    serializer_class = ETLSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, "is_admin") and user.is_admin:
            return ETL.objects.all().order_by("-created_at")
        return ETL.objects.filter(is_active=True, is_validated=True).order_by("-created_at")

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
            '.venv', 'venv', '__pycache__', '.git',
            '.idea', '.vscode', 'node_modules', '.DS_Store', 'Thumbs.db',
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

    # ── read_config ───────────────────────────────────────────────

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated, IsAdmin])
    def read_config(self, request, pk=None):
        """Return parsed config + raw content + detected path-like keys."""
        etl: ETL = self.get_object()

        if not etl.resolved_config_file:
            return Response(
                {"detail": "No config file resolved for this ETL."},
                status=status.HTTP_404_NOT_FOUND
            )

        cf = Path(etl.resolved_config_file)
        if not cf.exists():
            return Response(
                {"detail": "Config file not found on disk."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            raw = cf.read_text(encoding="utf-8")
        except Exception as e:
            raw = f"Could not read: {e}"

        path_like_keys = get_path_like_keys(etl.config)   # ← uses shared helper

        return Response({
            "config_file_path": etl.config_file_path,
            "resolved_path": etl.resolved_config_file,
            "parsed": etl.config,
            "raw": raw,
            "path_like_keys": path_like_keys,
            "current_classifications": etl.path_classifications,
        })

    # ── update_base_config ────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def update_base_config(self, request, pk=None):
        """
        Permanently merge a set of key/value pairs into the ETL's base config.
        Called when the user chooses "Save as default" for one or more overrides.
        """
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

        new_path_keys = get_path_like_keys(updated_config)

        return Response({
            **ETLSerializer(etl).data,
            "updated_keys": list(incoming.keys()),
            "path_like_keys": new_path_keys,
        })

    # ── classify_paths ────────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def classify_paths(self, request, pk=None):
        etl: ETL = self.get_object()
        classifications = request.data.get("classifications", {})

        if not isinstance(classifications, dict):
            return Response(
                {"detail": "classifications must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST
            )

        valid_types = {"input", "output", "other"}
        bad = [k for k, v in classifications.items() if v not in valid_types]
        if bad:
            return Response(
                {"detail": f"Invalid classification type for keys: {bad}. Use: input, output, other."},
                status=status.HTTP_400_BAD_REQUEST
            )

        etl.path_classifications = classifications
        etl.save(update_fields=["path_classifications"])

        return Response({
            "path_classifications": etl.path_classifications,
            "detail": "Path classifications saved."
        })

    # ── validate ──────────────────────────────────────────────────

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def validate(self, request, pk=None):
        etl: ETL = self.get_object()
        errors = []
        warnings = []
        info = {}
        path_check_results = {}

        if not etl.extracted_path or not Path(etl.extracted_path).exists():
            return Response(
                {"detail": "ETL not extracted yet."},
                status=status.HTTP_400_BAD_REQUEST
            )

        extracted = Path(etl.extracted_path)

        if not etl.entry_point_path:
            errors.append("No entry point filename configured.")
        else:
            ep = _find_file(extracted, etl.entry_point_path)
            if not ep:
                errors.append(f"Entry point '{etl.entry_point_path}' not found.")
                py_files = [
                    str(f.relative_to(extracted))
                    for f in extracted.rglob("*.py")
                    if not any(ex in f.parts for ex in EXCLUDED_DIRS)
                ][:10]
                if py_files:
                    info["available_py_files"] = py_files
            else:
                etl.resolved_entry_point = str(ep)
                info["entry_point"] = str(ep.relative_to(extracted))

        if etl.config_file_path:
            cf = _find_file(extracted, etl.config_file_path)
            if not cf:
                errors.append(f"Config file '{etl.config_file_path}' not found.")
                found_configs = [
                    str(f.relative_to(extracted))
                    for f in extracted.rglob("*")
                    if f.suffix.lower() in CONFIG_EXTENSIONS
                    and not any(ex in f.parts for ex in EXCLUDED_DIRS)
                ][:10]
                if found_configs:
                    info["available_config_files"] = found_configs
            else:
                etl.resolved_config_file = str(cf)
                parsed, parse_err = _parse_config(cf)
                if parse_err:
                    errors.append(f"Config file invalid: {parse_err}")
                else:
                    etl.config = parsed
                    info["config_file"] = str(cf.relative_to(extracted))
                    info["config_keys"] = list(parsed.keys())

                    path_like = get_path_like_keys(parsed)     # ← shared helper
                    info["path_like_keys_found"] = len(path_like)

                    for key, val in path_like.items():
                        p = Path(val)
                        accessible = p.exists()
                        path_check_results[key] = {
                            "path": val,
                            "accessible": accessible,
                            "classification": etl.path_classifications.get(key, "unclassified"),
                        }
                        if not accessible:
                            warnings.append(
                                f"Path '{val}' (config key: {key}) is not accessible."
                            )

                    info["path_checks"] = path_check_results

                    unclassified = [k for k in path_like if k not in etl.path_classifications]
                    if unclassified:
                        warnings.append(
                            f"{len(unclassified)} path(s) not yet classified as input/output: "
                            f"{', '.join(unclassified[:5])}"
                        )
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
        else:
            info["python_version"] = etl.python_version

        if etl.has_shared_venv:
            info["shared_venv"] = "exists — dependencies will not be reinstalled"
        else:
            info["shared_venv"] = "not built yet — will be created on first execution"

        if errors:
            etl.is_validated = False
            etl.validation_errors = errors
            etl.save(update_fields=[
                "is_validated", "validation_errors",
                "resolved_entry_point", "resolved_config_file",
                "resolved_requirements", "config",
            ])
            return Response(
                {"detail": "Validation failed", "errors": errors, "warnings": warnings, "info": info},
                status=status.HTTP_400_BAD_REQUEST
            )

        etl.is_validated = True
        etl.validation_errors = []
        etl.save(update_fields=[
            "is_validated", "validation_errors",
            "resolved_entry_point", "resolved_config_file",
            "resolved_requirements", "config",
        ])

        response_data = ETLSerializer(etl).data
        response_data["validation_info"] = {
            "warnings": warnings,
            "info": info,
            "message": "ETL validated successfully",
        }
        return Response(response_data)

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
                status=status.HTTP_400_BAD_REQUEST
            )
        etl.is_active = True
        etl.save(update_fields=["is_active"])
        return Response(ETLSerializer(etl).data)

    # ── delete ────────────────────────────────────────────────────

    @action(detail=True, methods=["delete"], permission_classes=[IsAuthenticated, IsAdmin])
    def delete(self, request, pk=None):
        etl: ETL = self.get_object()
        if etl.executions.exists():
            return Response(
                {"detail": "Cannot delete ETL with existing executions."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if etl.shared_venv_path:
            p = Path(etl.shared_venv_path)
            if p.exists():
                shutil.rmtree(p, ignore_errors=True)
        if etl.extracted_path:
            p = Path(etl.extracted_path)
            if p.exists():
                shutil.rmtree(p, ignore_errors=True)
        etl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Disk write-back helper ────────────────────────────────────────

def _write_back_config(etl: ETL, changed_keys: dict) -> None:
    """
    Best-effort: write updated config back to the config file on disk.
    JSON/YAML in-place; others get a .updated.json sidecar.
    Failures are logged but never raised — the DB is the source of truth.
    """
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
    print(f"[CONFIG] Sidecar written: {sidecar}")