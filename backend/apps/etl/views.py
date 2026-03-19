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
from .models import ETL
from .serializers import ETLSerializer


class ETLViewSet(viewsets.ModelViewSet):
    """
    API for managing ETL definitions.

    - Admins: list, create (upload zip), update, delete
    - Authenticated users: read-only access to validated & active ETLs
    """

    queryset = ETL.objects.all().order_by("-created_at")
    serializer_class = ETLSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user

        # Admins see everything
        if hasattr(user, "is_admin") and user.is_admin:
            return ETL.objects.all().order_by("-created_at")

        # Normal users see only validated & active ETLs
        return ETL.objects.filter(is_active=True, is_validated=True).order_by("-created_at")

    def perform_create(self, serializer):
        """
        Attach creator and validate uploaded file.
        Extract ZIP and parse config.json.
        """
        zip_file = self.request.FILES.get("zip_file")

        if not zip_file:
            raise serializers.ValidationError(
                {"zip_file": ["This field is required."]}
            )

        # Check file extension
        _, ext = os.path.splitext(zip_file.name)
        if ext.lower() != ".zip":
            raise serializers.ValidationError(
                {"zip_file": ["Only .zip files are allowed."]}
            )

        # Check file size
        max_size = int(os.getenv("MAX_UPLOAD_SIZE", settings.FILE_UPLOAD_MAX_MEMORY_SIZE))
        if zip_file.size > max_size:
            raise serializers.ValidationError(
                {
                    "zip_file": [
                        f"File too large (>{max_size} bytes). "
                        f"Current size: {zip_file.size} bytes."
                    ]
                }
            )

        # Save ETL to database
        etl: ETL = serializer.save(created_by=self.request.user)

        # Prepare extraction directory
        extracted_root = Path(settings.MEDIA_ROOT) / "extracted" / str(etl.id)
        extracted_root.mkdir(parents=True, exist_ok=True)

        # Extract ZIP with safety checks
        try:
            self._safe_extract_zip(etl.zip_file.path, extracted_root)
            etl.extracted_path = str(extracted_root)
        except Exception as e:
            etl.validation_errors = [f"Failed to extract ZIP: {str(e)}"]
            etl.save(update_fields=["validation_errors"])
            raise serializers.ValidationError(
                {"zip_file": [f"Extraction failed: {str(e)}"]}
            )

        # Try to load config.json
        config_path = extracted_root / "config.json"
        if config_path.exists():
            try:
                with config_path.open("r", encoding="utf-8") as f:
                    etl.config = _json.load(f)
            except Exception as cfg_err:
                etl.validation_errors = [f"Failed to parse config.json: {cfg_err}"]
        else:
            etl.validation_errors = ["config.json not found in ZIP"]

        etl.save(update_fields=["extracted_path", "config", "validation_errors"])

    def _safe_extract_zip(self, zip_path, extract_to):
        """
        Safely extract ZIP file, skipping dangerous/unnecessary files

        Args:
            zip_path: Path to ZIP file
            extract_to: Directory to extract to
        """
        # Files/folders to skip (security + cleanup)
        SKIP_PATTERNS = [
            '.venv',  # Virtual environment
            'venv',
            '__pycache__',  # Python cache
            '.git',  # Git repository
            '.idea',  # IDE settings
            '.vscode',
            'node_modules',  # Node modules
            '.DS_Store',  # macOS metadata
            'Thumbs.db',  # Windows metadata
        ]

        with zipfile.ZipFile(zip_path, 'r') as zf:
            for member in zf.namelist():
                # Security check: prevent path traversal
                if member.startswith('/') or '..' in member:
                    continue

                # Skip unwanted files/folders
                if any(pattern in member for pattern in SKIP_PATTERNS):
                    continue

                # Skip files with paths > 200 chars (Windows compatibility)
                full_path = extract_to / member
                if len(str(full_path)) > 200:
                    continue

                try:
                    zf.extract(member, extract_to)
                except Exception as e:
                    # Log but continue extraction
                    print(f"Warning: Could not extract {member}: {e}")
                    continue

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdmin])
    def validate(self, request, pk=None):
        """
        Validate an ETL package before activation.

        Checks:
        1. Extracted path exists and contains files
        2. Entry point file exists (main.py or from config)
        3. requirements.txt exists (warning if missing)
        4. Config structure is valid
        5. Can find ETL root directory

        Returns detailed validation results with errors and warnings.
        """
        from pathlib import Path

        etl: ETL = self.get_object()

        errors = []
        warnings = []
        info = {}

        # ─── CHECK 1: Extracted path exists ───────────────────────────────────

        if not etl.extracted_path:
            errors.append("ETL has not been extracted yet")
            etl.is_validated = False
            etl.validation_errors = errors
            etl.save(update_fields=["is_validated", "validation_errors"])
            return Response(
                {"detail": "Validation failed", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        extracted_path = Path(etl.extracted_path)

        if not extracted_path.exists():
            errors.append(f"Extracted path does not exist: {etl.extracted_path}")
            etl.is_validated = False
            etl.validation_errors = errors
            etl.save(update_fields=["is_validated", "validation_errors"])
            return Response(
                {"detail": "Validation failed", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Count files (excluding __pycache__, .venv, etc.)
        excluded_dirs = {".venv", "venv", "__pycache__", ".git", "node_modules"}
        all_files = []
        for f in extracted_path.rglob("*"):
            if f.is_file() and not any(exc in str(f) for exc in excluded_dirs):
                all_files.append(f)

        if len(all_files) == 0:
            errors.append("Extracted folder is empty")

        info["total_files"] = len(all_files)
        info["extracted_path"] = str(extracted_path)

        # ─── CHECK 2: Find ETL root (where main.py lives) ─────────────────────

        def _find_etl_root(base_path: Path) -> Path:
            """
            Find the actual ETL root directory.
            Searches for main.py recursively, up to 2 levels deep.
            """
            # Check current level
            if (base_path / "main.py").exists():
                return base_path

            # Check one level down
            for subdir in base_path.iterdir():
                if subdir.is_dir() and (subdir / "main.py").exists():
                    return subdir

            # Check two levels down
            for subdir in base_path.iterdir():
                if subdir.is_dir():
                    for subsubdir in subdir.iterdir():
                        if subsubdir.is_dir() and (subsubdir / "main.py").exists():
                            return subsubdir

            # Not found
            return base_path

        etl_root = _find_etl_root(extracted_path)

        if etl_root != extracted_path:
            info["etl_root_relative"] = str(etl_root.relative_to(extracted_path))
            warnings.append(f"ETL is nested in subfolder: {etl_root.name}")

        # ─── CHECK 3: Entry point exists ──────────────────────────────────────

        # Default entry point
        entry_point = "main.py"

        # Check if config specifies a different entry point
        if etl.config and isinstance(etl.config, dict):
            entry_point = etl.config.get("entry_point", "main.py")

        # Search for entry point recursively
        entry_point_matches = list(etl_root.rglob(entry_point))

        if not entry_point_matches:
            errors.append(f"Entry point '{entry_point}' not found in ETL package")

            # Try to find ANY .py files to help debug
            py_files = list(etl_root.rglob("*.py"))
            if py_files:
                py_names = [f.name for f in py_files[:5]]
                warnings.append(f"Found Python files but not {entry_point}: {py_names}")
        else:
            # Use the shallowest match
            entry_point_matches.sort(key=lambda p: len(p.parts))
            entry_file = entry_point_matches[0]
            info["entry_point_found"] = str(entry_file.relative_to(extracted_path))

            # Update config if not set
            if not etl.config or not isinstance(etl.config, dict):
                etl.config = {}

            if "entry_point" not in etl.config:
                etl.config["entry_point"] = entry_point

        # ─── CHECK 4: requirements.txt exists ─────────────────────────────────

        requirements_matches = list(etl_root.rglob("requirements.txt"))

        if not requirements_matches:
            warnings.append("requirements.txt not found - ETL may have no dependencies")
        else:
            req_file = requirements_matches[0]
            info["requirements_found"] = str(req_file.relative_to(extracted_path))

            # Quick check for suspicious dependencies
            try:
                req_content = req_file.read_text(encoding="utf-8")
                if not req_content.strip():
                    warnings.append("requirements.txt is empty")
            except Exception:
                warnings.append("Could not read requirements.txt")

        # ─── CHECK 5: Configuration structure ─────────────────────────────────

        # Look for config.json or config/ folder
        has_config = False
        config_sources = []

        # Option 1: config.json file
        config_json = etl_root / "config.json"
        if config_json.exists():
            has_config = True
            config_sources.append("config.json")

            # Try to parse it
            try:
                import json
                with open(config_json, 'r', encoding='utf-8') as f:
                    json_config = json.load(f)

                # Merge into etl.config if not already loaded
                if not etl.config or not isinstance(etl.config, dict):
                    etl.config = json_config

                info["config_json_valid"] = True
            except Exception as e:
                errors.append(f"config.json exists but is invalid: {str(e)}")

        # Option 2: config/ folder
        config_folder = etl_root / "config"
        if config_folder.exists() and config_folder.is_dir():
            has_config = True
            config_sources.append("config/ folder")

            # Count config files
            config_files = list(config_folder.glob("*.json")) + list(config_folder.glob("*.toml"))
            if config_files:
                info["config_folder_files"] = [f.name for f in config_files]
            else:
                warnings.append("config/ folder exists but is empty")

        # Option 3: Any JSON files in root
        json_files = list(etl_root.glob("*.json"))
        if json_files and not has_config:
            has_config = True
            config_sources.append(f"{len(json_files)} JSON files")
            info["json_files_found"] = [f.name for f in json_files]

        if not has_config:
            warnings.append("No configuration found (no config.json or config/ folder)")
        else:
            info["config_sources"] = config_sources

        # ─── CHECK 6: Validate config fields (if present) ────────────────────

        if etl.config and isinstance(etl.config, dict):
            # Check for recommended fields
            recommended = {
                "entry_point": "Script to execute",
                "python_version": "Python version requirement",
                "input_requirements": "Expected input files",
                "expected_outputs": "Expected output files",
            }

            missing_recommended = []
            for field, desc in recommended.items():
                if field not in etl.config:
                    missing_recommended.append(f"{field} ({desc})")

            if missing_recommended:
                warnings.append(f"Config missing recommended fields: {', '.join(missing_recommended)}")

            # Validate input_requirements structure
            if "input_requirements" in etl.config:
                input_reqs = etl.config["input_requirements"]
                if isinstance(input_reqs, dict):
                    info["input_requirements_count"] = len(input_reqs)
                else:
                    warnings.append("input_requirements should be a dictionary")

            # Validate expected_outputs
            if "expected_outputs" in etl.config:
                outputs = etl.config["expected_outputs"]
                if isinstance(outputs, list):
                    info["expected_outputs_count"] = len(outputs)
                else:
                    warnings.append("expected_outputs should be a list")

        # ─── CHECK 7: Dangerous patterns ──────────────────────────────────────

        # Check for .venv or venv folders (should be excluded)
        venv_folders = list(extracted_path.rglob(".venv")) + list(extracted_path.rglob("venv"))
        if venv_folders:
            warnings.append(
                f"Found {len(venv_folders)} virtual environment folders - these will be skipped during execution")

        # ─── FINAL DECISION ───────────────────────────────────────────────────

        if errors:
            etl.is_validated = False
            etl.validation_errors = errors
            etl.save(update_fields=["is_validated", "validation_errors", "config"])

            return Response(
                {
                    "detail": "Validation failed",
                    "errors": errors,
                    "warnings": warnings,
                    "info": info
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # ✅ VALIDATION PASSED
        etl.is_validated = True
        etl.validation_errors = []

        # Save any config updates
        etl.save(update_fields=["is_validated", "validation_errors", "config"])

        response_data = ETLSerializer(etl).data
        response_data["validation_info"] = {
            "warnings": warnings,
            "info": info,
            "message": "ETL validated successfully"
        }

        return Response(response_data, status=status.HTTP_200_OK)

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

    @action(detail=True, methods=["delete"], permission_classes=[IsAuthenticated, IsAdmin])
    def delete(self, request, pk=None):
        """Delete an ETL (admin only)"""
        etl: ETL = self.get_object()

        # Check if ETL has executions
        if etl.executions.exists():
            return Response(
                {"detail": "Cannot delete ETL with existing executions."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Delete extracted files
        if etl.extracted_path:
            extracted_path = Path(etl.extracted_path)
            if extracted_path.exists():
                shutil.rmtree(extracted_path, ignore_errors=True)

        etl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)