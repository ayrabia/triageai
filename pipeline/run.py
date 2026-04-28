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


def _build_system_prompt(criteria: list[str]) -> str:
    criteria_block = "\n".join(f"- {c}" for c in criteria)
    return f"""You are reviewing a faxed medical referral for a specialty clinic.

IMPORTANT DISTINCTION: Referral documents often contain the patient's ENTIRE medical history
(problem list) mixed in with the actual reason for the referral. You must carefully separate these.

Extract and classify the referral using the classify_referral tool.

REFERRAL REASON: The SPECIFIC reason this patient was referred — the chief complaint, reason
for consultation, or the issue that prompted the referral.

RELEVANT CLINICAL FINDINGS: Key symptoms, exam findings, and history DIRECTLY RELATED to
the referral reason only. Ignore unrelated conditions from the problem list.

IMAGING SUMMARY: If any imaging (CT, MRI, X-ray) is mentioned, summarize the key
findings/impressions. If imaging is referenced but the report is NOT attached, write:
"MISSING: [type] referenced but report not included". Null if no imaging mentioned.

MISSING INFORMATION: Expected documents or data that are absent (CT/MRI reports, lab results,
clinical notes, referring physician contact info).

PROVIDER URGENCY LABEL: How the REFERRING PROVIDER marked urgency — priority fields,
STAT/URGENT labels, provider notes, insurance priority status. Report the label and exactly
where you found it. If none: label = "none found".

THREE-TIER CLASSIFICATION — choose exactly one:

  PRIORITY REVIEW:
    Clinical content matches one or more urgent criteria below, REGARDLESS of provider label.

  SECONDARY APPROVAL:
    Provider marked urgent/stat/priority BUT clinical content does NOT match any urgent
    criteria. NEVER silently downgrade a provider's urgent label.

  STANDARD QUEUE:
    No urgent criteria matched AND provider did NOT mark urgent. Both must be true.

Urgent criteria for this clinic:
{criteria_block}

CRITICAL: action MUST match your reasoning. STANDARD QUEUE requires BOTH: no criteria
matched AND provider did not mark urgent. Double-check before submitting.

SUMMARY: 2-3 sentence plain-language summary for a referral coordinator.

NEXT STEPS: One-sentence scheduling recommendation based on the classification."""


_CLASSIFY_TOOL = {
    "name": "classify_referral",
    "description": "Record the structured classification of a faxed medical referral.",
    "input_schema": {
        "type": "object",
        "properties": {
            "referral_reason": {
                "type": "string",
                "description": "The specific reason this patient was referred.",
            },
            "relevant_clinical_findings": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Key findings directly related to the referral reason.",
            },
            "imaging_summary": {
                "type": ["string", "null"],
                "description": "Imaging findings summary, or null if none mentioned.",
            },
            "missing_information": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Expected documents or data that are absent.",
            },
            "provider_urgency_label": {
                "type": "object",
                "description": "How the referring provider marked urgency.",
                "properties": {
                    "label": {
                        "type": "string",
                        "enum": ["urgent", "stat", "routine", "elective", "none found"],
                    },
                    "source": {
                        "type": "string",
                        "description": "Where in the document this label was found.",
                    },
                },
                "required": ["label", "source"],
            },
            "action": {
                "type": "string",
                "enum": ["PRIORITY REVIEW", "SECONDARY APPROVAL", "STANDARD QUEUE"],
                "description": "Triage classification tier. Must match reasoning.",
            },
            "matched_criteria": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Urgent criteria that matched. Empty if none.",
            },
            "evidence": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Verbatim quotes from the document supporting the classification.",
            },
            "provider_label": {
                "type": "string",
                "enum": ["urgent", "stat", "routine", "elective", "none found"],
                "description": "Normalised provider urgency label.",
            },
            "referring_clinic_classification": {
                "type": ["string", "null"],
                "description": "Urgency label exactly as written in the document, or null.",
            },
            "reasoning": {
                "type": "string",
                "description": "Step-by-step reasoning for the chosen action tier.",
            },
            "recommended_window": {
                "type": ["string", "null"],
                "description": "Scheduling window for PRIORITY REVIEW cases, else null.",
            },
            "next_steps": {
                "type": "string",
                "description": "One-sentence scheduling recommendation.",
            },
            "summary": {
                "type": "string",
                "description": "2-3 sentence plain-language summary for the coordinator.",
            },
        },
        "required": [
            "referral_reason",
            "relevant_clinical_findings",
            "missing_information",
            "provider_urgency_label",
            "action",
            "matched_criteria",
            "evidence",
            "provider_label",
            "reasoning",
            "next_steps",
            "summary",
        ],
    },
}


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


def _call_claude(image_content: list[dict], system_prompt: str) -> dict:
    """Send page images to Claude via Bedrock using tool use. Returns tool input dict.

    Instructions live in the system prompt (operator-trusted). The user message
    contains only the PDF images (untrusted data). tool_choice forces Claude to
    respond exclusively via the classify_referral schema — it cannot produce
    free-form text, so injected instructions inside the PDF have no effect.
    """
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
                "system": system_prompt,
                "tools": [_CLASSIFY_TOOL],
                "tool_choice": {"type": "tool", "name": "classify_referral"},
                "messages": [{"role": "user", "content": image_content}],
            }
        ),
    )

    body = json.loads(response["body"].read())
    for block in body.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "classify_referral":
            return block["input"]

    raise ValueError("Claude did not invoke classify_referral — check model response")


def _apply_result(referral: Referral, result: dict, elapsed_ms: int) -> None:
    """Map classify_referral tool input onto a Referral ORM object in-place."""
    referral.referral_reason = result.get("referral_reason")
    referral.relevant_clinical_findings = result.get("relevant_clinical_findings")
    referral.imaging_summary = result.get("imaging_summary")
    referral.missing_information = result.get("missing_information")
    referral.provider_urgency_label = result.get("provider_urgency_label")
    referral.action = _ACTION_MAP.get(result.get("action", ""))
    referral.matched_criteria = result.get("matched_criteria")
    referral.evidence = result.get("evidence")
    referral.provider_label = result.get("provider_label")
    referral.reasoning = result.get("reasoning")
    referral.recommended_window = result.get("recommended_window")
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
        system_prompt = _build_system_prompt(criteria)
        result = _call_claude(image_content, system_prompt)
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
        system_prompt = _build_system_prompt(criteria)
        result = _call_claude(image_content, system_prompt)
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
