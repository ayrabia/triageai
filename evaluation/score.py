"""
TriageAI Evaluation Scorer

Reads v3_notriage Training pipeline results, compares against ground truth,
and reports precision, recall, F1 per tier plus critical safety flags.

Evaluated dataset: v3_notriage (Training_Referral files)
  - Triage decisions were physically covered before scanning
  - This is the production-realistic scenario: AI reviews first, no prior
    human decision visible
  - v1/v2 results are NOT used here because they contain triage NP override
    notes that would never appear on a fresh incoming referral

Action field normalization:
  "FLAGGED FOR PRIORITY REVIEW" -> "PRIORITY REVIEW"
  "SECONDARY APPROVAL NEEDED"   -> "SECONDARY APPROVAL"
  "STANDARD QUEUE"              -> "STANDARD QUEUE"  (kept distinct — should
                                   not appear in v3 since every provider in
                                   this dataset marked their referral urgent)
"""

import json
import os
import glob
from datetime import datetime
from collections import defaultdict

# ---------------------------------------------------------------------------
# Ground truth
# ---------------------------------------------------------------------------

GROUND_TRUTH = {
    "R01": "PRIORITY REVIEW",
    "R02": "SECONDARY APPROVAL",
    "R03": "PRIORITY REVIEW",
    "R04": "PRIORITY REVIEW",
    "R05": "SECONDARY APPROVAL",
    "R06": "SECONDARY APPROVAL",
}

# ---------------------------------------------------------------------------
# Action field normalization
# ---------------------------------------------------------------------------

ACTION_MAP = {
    "FLAGGED FOR PRIORITY REVIEW": "PRIORITY REVIEW",
    "SECONDARY APPROVAL NEEDED":   "SECONDARY APPROVAL",
    # STANDARD QUEUE is intentionally not mapped to SECONDARY APPROVAL —
    # they are different tiers. STANDARD QUEUE means the provider also agreed
    # it was routine. If it appears in v3 results, it is a classification error.
    "STANDARD QUEUE":              "STANDARD QUEUE",
}

RESULTS_DIR = os.path.join(
    os.path.dirname(__file__), "..", "pipeline", "pipeline_results", "v3_notriage"
)
OUTPUT_DIR  = os.path.join(os.path.dirname(__file__), "results")


def referral_id_from_filename(filename: str) -> str | None:
    """
    Extract referral ID from filename.
    'Training_Referral01_results.json' -> 'R01'
    Returns None if the file doesn't match a known ground-truth ID.
    """
    basename = os.path.basename(filename)
    # Match Training_Referral## files from v3_notriage
    if basename.startswith("Training_Referral") and "_results.json" in basename:
        num_part = basename.replace("Training_Referral", "").split("_")[0]
        candidate = f"R{num_part}"
        if candidate in GROUND_TRUTH:
            return candidate
    return None


def load_results(results_dir: str) -> list[dict]:
    """
    Load all Training_Referral JSON files from v3_notriage.
    Returns list of dicts with keys: referral_id, file, predicted, raw_action,
    pipeline_version.
    """
    pattern = os.path.join(results_dir, "Training_Referral*_results.json")
    files = sorted(glob.glob(pattern))

    rows = []
    for filepath in files:
        ref_id = referral_id_from_filename(filepath)
        if ref_id is None:
            continue

        with open(filepath) as f:
            data = json.load(f)

        raw_action = data["claude_vision"]["criteria_check"]["action"]
        predicted  = ACTION_MAP.get(raw_action, raw_action)

        rows.append({
            "referral_id":       ref_id,
            "file":              data.get("file", os.path.basename(filepath)),
            "pipeline_version":  data.get("pipeline_version", "unknown"),
            "timestamp":         data.get("timestamp", ""),
            "raw_action":        raw_action,
            "predicted":         predicted,
            "ground_truth":      GROUND_TRUTH[ref_id],
            "correct":           predicted == GROUND_TRUTH[ref_id],
            "confidence":        data["claude_vision"]["criteria_check"].get("evidence", None),
        })

    return rows


def compute_metrics(rows: list[dict]) -> dict:
    """
    Compute per-tier precision, recall, F1.
    Also collect false negatives on PRIORITY REVIEW (critical safety metric).
    """
    tiers = sorted(set(GROUND_TRUTH.values()))
    metrics = {}

    for tier in tiers:
        tp = sum(1 for r in rows if r["predicted"] == tier and r["ground_truth"] == tier)
        fp = sum(1 for r in rows if r["predicted"] == tier and r["ground_truth"] != tier)
        fn = sum(1 for r in rows if r["predicted"] != tier and r["ground_truth"] == tier)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1        = (2 * precision * recall / (precision + recall)
                     if (precision + recall) > 0 else 0.0)

        metrics[tier] = {
            "true_positives":  tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision":       round(precision, 4),
            "recall":          round(recall, 4),
            "f1":              round(f1, 4),
        }

    return metrics


def find_missed_priority(rows: list[dict]) -> list[dict]:
    """Return rows that are PRIORITY REVIEW in ground truth but not predicted (false negatives)."""
    return [r for r in rows if r["ground_truth"] == "PRIORITY REVIEW" and not r["correct"]]


def print_report(rows: list[dict], metrics: dict, missed_priority: list[dict]) -> None:
    total   = len(rows)
    correct = sum(1 for r in rows if r["correct"])

    print()
    print("=" * 60)
    print("  TRIAGEAI EVALUATION REPORT")
    print("=" * 60)
    print(f"  Dataset          : v3_notriage (Training_Referral files)")
    print(f"  Scenario         : Production — no prior triage decisions visible")
    print(f"  Pipeline version : {rows[0]['pipeline_version'] if rows else 'n/a'}")
    print(f"  Evaluated on     : {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Referrals scored : {total}")
    print(f"  Overall accuracy : {correct}/{total}  ({correct/total*100:.1f}%)")
    print()

    print("  PER-REFERRAL RESULTS")
    print("  " + "-" * 56)
    print(f"  {'ID':<6} {'File':<28} {'Predicted':<22} {'GT':<22} {'OK'}")
    print("  " + "-" * 56)
    for r in sorted(rows, key=lambda x: x["referral_id"]):
        ok = "✓" if r["correct"] else "✗"
        print(f"  {r['referral_id']:<6} {r['file']:<28} {r['predicted']:<22} {r['ground_truth']:<22} {ok}")
    print()

    print("  PER-TIER METRICS")
    print("  " + "-" * 56)
    print(f"  {'Tier':<26} {'Precision':>10} {'Recall':>8} {'F1':>8}  {'TP':>4} {'FP':>4} {'FN':>4}")
    print("  " + "-" * 56)
    for tier, m in sorted(metrics.items()):
        print(
            f"  {tier:<26} {m['precision']:>10.4f} {m['recall']:>8.4f} {m['f1']:>8.4f}"
            f"  {m['true_positives']:>4} {m['false_positives']:>4} {m['false_negatives']:>4}"
        )
    print()

    print("  CRITICAL SAFETY: MISSED PRIORITY REVIEW (False Negatives)")
    print("  " + "-" * 56)
    if missed_priority:
        for r in missed_priority:
            print(f"  ⚠  {r['referral_id']}  ({r['file']}) — predicted {r['predicted']!r}")
    else:
        print("  ✓  None — all PRIORITY REVIEW cases were correctly identified.")
    print()

    unexpected_standard = [r for r in rows if r["raw_action"] == "STANDARD QUEUE"]
    if unexpected_standard:
        print("  WARNING: UNEXPECTED STANDARD QUEUE RESULTS")
        print("  " + "-" * 56)
        print("  In v3, STANDARD QUEUE should not appear — every provider in this")
        print("  dataset marked their referral urgent. These indicate the pipeline")
        print("  silently dropped a provider-urgent referral into the standard queue,")
        print("  which is the highest-risk classification error.")
        for r in unexpected_standard:
            print(f"  ⚠  {r['referral_id']}  ({r['file']})")
        print()

    print("=" * 60)
    print()


def build_output(rows: list[dict], metrics: dict, missed_priority: list[dict]) -> dict:
    total   = len(rows)
    correct = sum(1 for r in rows if r["correct"])
    unexpected_standard = [r for r in rows if r["raw_action"] == "STANDARD QUEUE"]

    return {
        "evaluation_timestamp": datetime.now().isoformat(),
        "dataset":              "v3_notriage",
        "scenario":             "Production — no prior triage decisions visible",
        "pipeline_version":     rows[0]["pipeline_version"] if rows else "unknown",
        "summary": {
            "total_referrals": total,
            "correct":         correct,
            "accuracy":        round(correct / total, 4) if total else 0.0,
        },
        "per_tier_metrics": metrics,
        "critical_safety": {
            "missed_priority_review_count":    len(missed_priority),
            "missed_priority_review_ids":      [r["referral_id"] for r in missed_priority],
            "unexpected_standard_queue_count": len(unexpected_standard),
            "unexpected_standard_queue_ids":   [r["referral_id"] for r in unexpected_standard],
        },
        "per_referral": [
            {
                "referral_id":      r["referral_id"],
                "file":             r["file"],
                "pipeline_version": r["pipeline_version"],
                "raw_action":       r["raw_action"],
                "predicted":        r["predicted"],
                "ground_truth":     r["ground_truth"],
                "correct":          r["correct"],
            }
            for r in sorted(rows, key=lambda x: x["referral_id"])
        ],
    }


def main():
    rows = load_results(RESULTS_DIR)

    if not rows:
        print("No matching referral result files found.")
        return

    metrics        = compute_metrics(rows)
    missed_priority = find_missed_priority(rows)

    print_report(rows, metrics, missed_priority)

    output = build_output(rows, metrics, missed_priority)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(OUTPUT_DIR, f"eval_{ts}.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"  Results saved to: {out_path}")
    print()


if __name__ == "__main__":
    main()
