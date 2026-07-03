"""
Step 3 — Validate
Reads merged CSV from step 2. Applies optional JSON rules file (or defaults).
Outputs validated rows + a JSON report of what was flagged.

Can be re-run independently: if you change the rules file, re-run from step 3.
Step 4 will then use the new validated.csv without re-running steps 1 or 2.
"""

import json
import os
import sys
from pathlib import Path

import pandas as pd


DEFAULT_RULES = {
    "max_amount_diff": 5.0,
    "required_columns": ["invoice_number", "amount_inv"]
}


def load_inputs() -> dict:
    inputs_file = os.environ.get("ETL_STEP_INPUTS")
    if not inputs_file:
        print("[STEP3] ERROR: ETL_STEP_INPUTS not set", file=sys.stderr)
        sys.exit(1)
    return json.loads(Path(inputs_file).read_text(encoding="utf-8"))


def main():
    cfg = load_inputs()
    inputs     = cfg["inputs"]
    output_dir = Path(cfg["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    data_path = inputs.get("data", "")
    if not Path(data_path).exists():
        print(f"[STEP3] ERROR: merged CSV not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(data_path)
    print(f"[STEP3] Loaded {len(df)} rows for validation")

    # Load rules (optional)
    rules_path = inputs.get("rules", "")
    rules = DEFAULT_RULES.copy()
    if rules_path and Path(rules_path).exists():
        try:
            rules.update(json.loads(Path(rules_path).read_text(encoding="utf-8")))
            print(f"[STEP3] Loaded rules from {rules_path}")
        except Exception as e:
            print(f"[STEP3] Warning: could not read rules file: {e}")
    else:
        print("[STEP3] Using default validation rules")

    # Validate required columns
    report = {"total_rows": len(df), "issues": [], "valid_rows": 0, "rejected_rows": 0}
    for col in rules.get("required_columns", []):
        if col not in df.columns:
            print(f"[STEP3] ERROR: required column '{col}' is missing", file=sys.stderr)
            sys.exit(1)

    # Flag rows with amount_diff exceeding threshold
    rejected_mask = pd.Series([False] * len(df), index=df.index)
    if "amount_diff" in df.columns:
        threshold = rules.get("max_amount_diff", 5.0)
        over_threshold = df["amount_diff"].abs() > threshold
        rejected_mask |= over_threshold
        flagged_count = int(over_threshold.sum())
        if flagged_count:
            report["issues"].append({
                "rule": "max_amount_diff",
                "threshold": threshold,
                "flagged_rows": flagged_count,
            })
            print(f"[STEP3] {flagged_count} rows exceed amount_diff threshold ({threshold})")

    validated  = df[~rejected_mask]
    report["valid_rows"]    = int((~rejected_mask).sum())
    report["rejected_rows"] = int(rejected_mask.sum())

    out_data   = output_dir / "validated.csv"
    out_report = output_dir / "validation_report.json"

    validated.to_csv(out_data, index=False)
    out_report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"[STEP3] Valid: {report['valid_rows']} | Rejected: {report['rejected_rows']}")
    print(f"[STEP3] Saved validated data → {out_data}")
    print(f"[STEP3] Saved report → {out_report}")
    print("[STEP3] Validate complete.")


if __name__ == "__main__":
    main()
