"""
Smart ETL package analyzer that detects structure and asks user for confirmation.
"""
import json
from pathlib import Path
from typing import Dict, List, Optional
import re


class ETLAnalyzer:
    """Analyzes uploaded ETL package and suggests configuration."""

    def __init__(self, extracted_path: Path):
        self.extracted_path = Path(extracted_path)
        self.analysis_results = {}

    def analyze(self) -> Dict:
        """Run complete analysis and return suggestions for user review."""
        return {
            "entry_points": self.find_entry_points(),
            "config_files": self.find_config_files(),
            "requirements_files": self.find_requirements_files(),
            "input_patterns": self.detect_input_patterns(),
            "output_patterns": self.detect_output_patterns(),
            "python_files": self.count_python_files(),
            "detected_python_version": self.detect_python_version(),
        }

    def find_entry_points(self) -> List[Dict]:
        """Find potential entry points (main.py, run.py, etc.)"""
        candidates = []

        # Common entry point names
        common_names = ["main.py", "run.py", "app.py", "start.py", "__main__.py"]

        for pattern in common_names:
            for file in self.extracted_path.rglob(pattern):
                candidates.append({
                    "path": str(file.relative_to(self.extracted_path)),
                    "confidence": "high",
                    "reason": f"Common entry point name: {pattern}"
                })

        # Files with if __name__ == "__main__"
        for py_file in self.extracted_path.rglob("*.py"):
            try:
                content = py_file.read_text(encoding="utf-8")
                if 'if __name__ == "__main__"' in content:
                    rel_path = str(py_file.relative_to(self.extracted_path))
                    if not any(c["path"] == rel_path for c in candidates):
                        candidates.append({
                            "path": rel_path,
                            "confidence": "medium",
                            "reason": "Contains if __name__ == '__main__'"
                        })
            except Exception:
                continue

        return sorted(candidates, key=lambda x: x["confidence"], reverse=True)

    def find_config_files(self) -> List[Dict]:
        """Find potential configuration files."""
        config_files = []

        patterns = [
            ("*.json", "JSON config"),
            ("*.yaml", "YAML config"),
            ("*.yml", "YAML config"),
            ("*.toml", "TOML config"),
            ("*.ini", "INI config"),
            ("*.conf", "Config file"),
            ("settings.py", "Python settings"),
        ]

        for pattern, file_type in patterns:
            for file in self.extracted_path.rglob(pattern):
                # Skip common non-config files
                if any(skip in str(file) for skip in [
                    "node_modules", ".venv", "venv", "__pycache__",
                    "package.json", "tsconfig.json"
                ]):
                    continue

                config_files.append({
                    "path": str(file.relative_to(self.extracted_path)),
                    "type": file_type,
                    "size": file.stat().st_size,
                    "preview": self.get_file_preview(file)
                })

        return config_files

    def find_requirements_files(self) -> List[str]:
        """Find requirements.txt files."""
        req_files = []
        for file in self.extracted_path.rglob("requirements*.txt"):
            req_files.append(str(file.relative_to(self.extracted_path)))
        return req_files

    def detect_input_patterns(self) -> Dict:
        """Detect input file patterns by analyzing code."""
        patterns = {
            "pandas_reads": [],  # pd.read_excel("path")
            "file_opens": [],  # open("path")
            "path_references": [],  # Path("path")
        }

        for py_file in self.extracted_path.rglob("*.py"):
            try:
                content = py_file.read_text(encoding="utf-8")

                # Find pandas read operations
                pandas_reads = re.findall(
                    r'pd\.read_(?:excel|csv|json)\(["\']([^"\']+)["\']',
                    content
                )
                patterns["pandas_reads"].extend(pandas_reads)

                # Find file opens
                file_opens = re.findall(
                    r'open\(["\']([^"\']+)["\']',
                    content
                )
                patterns["file_opens"].extend(file_opens)

                # Find Path references
                path_refs = re.findall(
                    r'Path\(["\']([^"\']+)["\']',
                    content
                )
                patterns["path_references"].extend(path_refs)

            except Exception:
                continue

        # Deduplicate and filter
        return {
            "detected_inputs": list(set(
                patterns["pandas_reads"] +
                patterns["file_opens"] +
                patterns["path_references"]
            )),
            "confidence": "medium" if patterns["pandas_reads"] else "low"
        }

    def detect_output_patterns(self) -> List[str]:
        """Detect output folder patterns."""
        common_output_folders = [
            "outputs", "output", "results", "generated",
            "exports", "reports", "data/output"
        ]

        found = []
        for folder_name in common_output_folders:
            for folder in self.extracted_path.rglob(folder_name):
                if folder.is_dir():
                    found.append(str(folder.relative_to(self.extracted_path)))

        return list(set(found))

    def detect_python_version(self) -> Optional[str]:
        """Try to detect required Python version."""
        # Check pyproject.toml
        pyproject = self.extracted_path / "pyproject.toml"
        if pyproject.exists():
            try:
                import toml
                data = toml.load(pyproject)
                python_req = data.get("project", {}).get("requires-python")
                if python_req:
                    # Parse ">=3.9" to "3.9"
                    match = re.search(r'(\d+\.\d+)', python_req)
                    if match:
                        return match.group(1)
            except Exception:
                pass

        # Check setup.py
        setup_py = self.extracted_path / "setup.py"
        if setup_py.exists():
            try:
                content = setup_py.read_text()
                match = re.search(r'python_requires=["\']>=(\d+\.\d+)', content)
                if match:
                    return match.group(1)
            except Exception:
                pass

        return None

    def get_file_preview(self, file: Path, lines: int = 10) -> str:
        """Get preview of file content."""
        try:
            content = file.read_text(encoding="utf-8")
            preview_lines = content.split("\n")[:lines]
            return "\n".join(preview_lines)
        except Exception:
            return "[Binary file or read error]"

    def count_python_files(self) -> int:
        """Count Python files in package."""
        return len(list(self.extracted_path.rglob("*.py")))