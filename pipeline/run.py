"""
TriageAI Pipeline — production entry point.

Exposes a single callable:
    process_referral(referral_id, s3_key)

Designed to run as a FastAPI BackgroundTask. Opens its own DB session so it
is decoupled from the request lifecycle.

The heavy lifting (PDF → JPEG → Claude via Bedrock) is unchanged from the
validated v2 script. This module wraps it into a function that persists
results directly to the database.
"""

import base64
import json
import os
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import UUID

import boto3
from botocore.config import Config

from db.enums import ReferralAction, ReferralStatus
from db.models import AuditLog, Referral
from db.session import SessionLocal

S3_BUCKET = os.environ.get("S3_BUCKET", "triageai-test-referrals")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
CLAUDE_MODEL_ID = os.environ.get("CLAUDE_MODEL_ID", "us.anthropic.claude-sonnet-4-6")

PIPELINE_VERSION = "v3"

_DEFAULT_CRITERIA = [
    "Confirmed or suspected cancer / malignancy → recommended window: 3-4 weeks",
    "Rapidly growing neck or oral lesions → recommended window: 1-2 weeks",
    "Nasal fractures — ONLY if injury occurred within the past 1-2 weeks (acute window). "
    "If the fracture is older than 2 weeks, it is PAST the surgical window and does NOT "
    "qualify as an urgent criterion. → recommended window (if within window): 1-2 weeks",
    "Sudden hearing loss (acute onset, not gradual) → recommended window: within 1 week",
    "Airway compromise or obstruction → recommended window: same day / next day",
    "Tongue ties in infants with feeding issues → recommended window: 1-2 weeks",
    "Peritonsillar abscess → recommended window: same day / next day",
    "Foreign body in ear/nose/throat → recommended window: same day",
]


def _build_prompt(criteria: list[str]) -> str:
    criteria_block = "\n".join(f"- {c}" for c in criteria)
    return f"""You are reviewing a faxed medical referral for a specialty clinic.

IMPORTANT DISTINCTION: Referral documents often contain the patient's ENTIRE medical history
(problem list) mixed in with the actual reason for the referral. You must carefully separate these.

For this referral, extract and organize the following information:

1. REFERRAL REASON: What is the SPECIFIC reason this patient was referred? Look for the chief
   complaint, reason for consultation, or the specific issue that prompted the referral.

2. RELEVANT CLINICAL FINDINGS: Key symptoms, exam findings, and history DIRECTLY RELATED to
   the referral reason only. Ignore unrelated conditions from the problem list.

3. IMAGING SUMMARY: If any imaging (CT, MRI, X-ray) is mentioned:
   - Summarize the key findings/impressions
   - If imaging is referenced but the actual report is NOT attached, flag it as:
     "MISSING: [type of imaging] referenced but report not included"

4. MISSING INFORMATION: What expected documents or data are absent? Common missing items:
   CT/MRI reports, lab results, clinical notes, referring physician contact info.

5. PROVIDER URGENCY LABEL: Look for any indication of how the REFERRING PROVIDER marked
   urgency: priority fields, STAT/URGENT labels, provider notes, insurance priority status.
   Report exactly what you found — the label and where you found it.
   If no urgency label is present, report "No urgency label found in document."

6. CRITERIA CHECK:
Compare the referral against these urgent criteria:

{criteria_block}

   Apply this THREE-TIER classification logic:

   TIER 1 — "PRIORITY REVIEW":
     The clinical content matches one or more urgent criteria, REGARDLESS of what
     the referring provider labeled it.

   TIER 2 — "SECONDARY APPROVAL":
     The referring provider marked the referral as urgent/stat/priority, BUT the
     clinical content does NOT match any of the defined urgent criteria above.
     NEVER silently downgrade a provider's urgent label.

   TIER 3 — "STANDARD QUEUE":
     No urgent criteria matched AND the referring provider did NOT mark it as urgent.

   CRITICAL RULE: The "action" field in your JSON output MUST match your reasoning.
   STANDARD QUEUE is ONLY for cases where no criteria matched AND the provider did
   NOT mark it as urgent. Double-check your action field against your reasoning before outputting.

7. SUMMARY: A 2-3 sentence plain-language summary a referral coordinator can read quickly.

8. NEXT STEPS: Based on the classification tier and the matched criteria, provide a
   one-sentence scheduling recommendation for the triage coordinator.

Output your response as structured JSON with these exact keys:
{{
    "referral_reason": "...",
    "relevant_clinical_findings": ["...", "..."],
    "imaging_summary": "..." or null,
    "missing_information": ["...", "..."],
    "provider_urgency_label": {{
        "label": "urgent" or "routine" or "stat" or "none found",
        "source": "where in the document this was found"
    }},
    "criteria_check": {{
        "action": "PRIORITY REVIEW" or "SECONDARY APPROVAL" or "STANDARD QUEUE",
        "matched_criteria": ["..."] or [],
        "evidence": ["..."] or [],
        "provider_label": "urgent" or "routine" or "stat" or "elective" or "none found",
        "referring_clinic_classification": "the urgency label exactly as written, or null",
        "reasoning": "...",
        "recommended_window": "the recommended scheduling window if PRIORITY REVIEW, or null"
    }},
    "next_steps": "...",
    "summary": "..."
}}
"""


# Maps Claude's exact action string → ReferralAction enum
_ACTION_MAP = {
    "PRIORITY REVIEW": ReferralAction.PRIORITY_REVIEW,
    "SECONDARY APPROVAL": ReferralAction.SECONDARY_APPROVAL,
    "STANDARD QUEUE": ReferralAction.STANDARD_QUEUE,
}


def _pdf_to_images_from_path(local_path: str) -> list[dict]:
    """Convert a local PDF to base64 JPEG content blocks for Claude."""
    from pdf2image import convert_from_path

    images = convert_from_path(local_path, dpi=150, fmt="jpeg")
    content = []
    for img in images:
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=85)
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.b64encode(buf.getvalue()).decode(),
                },
            }
        )
    return content


def _pdf_to_images(s3_key: str) -> list[dict]:
    """Download PDF from S3, then convert to base64 JPEG content blocks."""
    s3 = boto3.client("s3", region_name=AWS_REGION)
    local_path = f"/tmp/{Path(s3_key).name}"
    s3.download_file(S3_BUCKET, s3_key, local_path)
    return _pdf_to_images_from_path(local_path)


def _call_claude(image_content: list[dict], prompt: str) -> dict:
    """Send page images + prompt to Claude via Bedrock. Returns parsed JSON."""
    payload = image_content + [{"type": "text", "text": prompt}]

    bedrock = boto3.client(
        "bedrock-runtime",
        region_name=AWS_REGION,
        config=Config(read_timeout=120, connect_timeout=10),
    )
    response = bedrock.invoke_model(
        modelId=CLAUDE_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": payload}],
            }
        ),
    )

    raw = json.loads(response["body"].read())["content"][0]["text"].strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(raw)


def _apply_result(referral: Referral, result: dict, elapsed_ms: int) -> None:
    """Map Claude's JSON output onto a Referral ORM object in-place."""
    cc = result.get("criteria_check", {})
    action_str = cc.get("action", "")

    referral.referral_reason = result.get("referral_reason")
    referral.relevant_clinical_findings = result.get("relevant_clinical_findings")
    referral.imaging_summary = result.get("imaging_summary")
    referral.missing_information = result.get("missing_information")
    referral.provider_urgency_label = result.get("provider_urgency_label")
    referral.action = _ACTION_MAP.get(action_str)
    referral.matched_criteria = cc.get("matched_criteria")
    referral.evidence = cc.get("evidence")
    referral.provider_label = cc.get("provider_label")
    referral.reasoning = cc.get("reasoning")
    referral.recommended_window = cc.get("recommended_window")
    referral.next_steps = result.get("next_steps")
    referral.summary = result.get("summary")
    referral.status = ReferralStatus.READY
    referral.model_used = CLAUDE_MODEL_ID
    referral.processing_time_ms = elapsed_ms
    referral.pipeline_version = PIPELINE_VERSION
    referral.processed_at = datetime.now(timezone.utc)


def _get_clinic_criteria(db, clinic_id) -> list[str]:
    """Fetch urgent criteria for a clinic from DB, fall back to ENT defaults."""
    from sqlalchemy import text
    row = db.execute(
        text("SELECT criteria FROM clinics WHERE id = :id"),
        {"id": str(clinic_id)},
    ).fetchone()
    if row and row[0] and isinstance(row[0], dict):
        return row[0].get("urgent_criteria") or _DEFAULT_CRITERIA
    return _DEFAULT_CRITERIA


def process_referral(referral_id: UUID, s3_key: str) -> None:
    """
    Run the v3 pipeline for a single referral and persist results to the DB.

    Opens its own session — safe to call from FastAPI BackgroundTasks or
    any async task runner (Celery, Lambda, etc.).

    On failure the referral stays in PENDING status with no classification
    data. The error is re-raised so the caller (e.g. task worker) can log it.
    """
    db = SessionLocal()
    try:
        t0 = time.monotonic()
        image_content = _pdf_to_images(s3_key)

        # Load referral early to get clinic_id for criteria lookup
        referral = db.get(Referral, referral_id)
        if referral is None:
            raise ValueError(f"Referral {referral_id} not found in DB")

        criteria = _get_clinic_criteria(db, referral.clinic_id)
        prompt = _build_prompt(criteria)
        result = _call_claude(image_content, prompt)
        elapsed_ms = int((time.monotonic() - t0) * 1000)

        _apply_result(referral, result, elapsed_ms)

        db.add(
            AuditLog(
                referral_id=referral_id,
                user_id=None,  # system event
                action="pipeline_completed",
                new_value={
                    "pipeline_version": PIPELINE_VERSION,
                    "action": referral.action.value if referral.action else None,
                    "processing_time_ms": elapsed_ms,
                },
            )
        )
        db.commit()

    except Exception as exc:
        db.rollback()
        # Mark the referral as failed so it surfaces in the UI
        # instead of hanging in pending forever.
        try:
            referral = db.get(Referral, referral_id)
            if referral:
                referral.status = ReferralStatus.FAILED
                db.add(AuditLog(
                    referral_id=referral_id,
                    user_id=None,
                    action="pipeline_failed",
                    new_value={"error": str(exc)[:500]},
                ))
                db.commit()
        except Exception:
            db.rollback()

    finally:
        db.close()


def process_referral_from_bytes(referral_id: UUID, pdf_bytes: bytes) -> None:
    """
    Run the pipeline on raw PDF bytes (used for UI drag-and-drop uploads).

    Saves the PDF to /tmp, then follows the same path as process_referral.
    No S3 involved — suitable for local dev and early demos before fax ingestion
    is wired up.
    """
    local_path = f"/tmp/{referral_id}.pdf"
    Path(local_path).write_bytes(pdf_bytes)

    db = SessionLocal()
    try:
        t0 = time.monotonic()
        image_content = _pdf_to_images_from_path(local_path)

        referral = db.get(Referral, referral_id)
        if referral is None:
            raise ValueError(f"Referral {referral_id} not found in DB")

        criteria = _get_clinic_criteria(db, referral.clinic_id)
        prompt = _build_prompt(criteria)
        result = _call_claude(image_content, prompt)
        elapsed_ms = int((time.monotonic() - t0) * 1000)

        _apply_result(referral, result, elapsed_ms)

        db.add(
            AuditLog(
                referral_id=referral_id,
                user_id=None,
                action="pipeline_completed",
                new_value={
                    "pipeline_version": PIPELINE_VERSION,
                    "action": referral.action.value if referral.action else None,
                    "processing_time_ms": elapsed_ms,
                    "source": "ui_upload",
                },
            )
        )
        db.commit()

    except Exception as exc:
        db.rollback()
        try:
            referral = db.get(Referral, referral_id)
            if referral:
                referral.status = ReferralStatus.FAILED
                db.add(AuditLog(
                    referral_id=referral_id,
                    user_id=None,
                    action="pipeline_failed",
                    new_value={"error": str(exc)[:500], "source": "ui_upload"},
                ))
                db.commit()
        except Exception:
            db.rollback()

    finally:
        db.close()
