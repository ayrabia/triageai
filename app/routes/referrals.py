"""
Referral routes — the core of the TriageAI API.

Endpoints:
  POST   /referrals/ingest          — ingest a new fax, kick off pipeline
  GET    /referrals/                — paginated queue for the caller's clinic
  GET    /referrals/{id}            — full detail for one referral
  PATCH  /referrals/{id}/status     — coordinator marks reviewed/approved/escalated
  GET    /referrals/{id}/audit      — HIPAA audit trail for a referral

All endpoints except /ingest require a valid Bearer token.
clinic_id is always derived from the authenticated user — never from request params.
"""

import os
import uuid as uuid_lib
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import boto3
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, computed_field
from sqlalchemy import asc, case
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from db.enums import ReferralAction, ReferralStatus, UserRole
from db.models import AuditLog, Referral, User
from pipeline.run import process_referral, process_referral_from_bytes

S3_BUCKET = os.environ.get("S3_BUCKET", "triageai-test-referrals")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

router = APIRouter()

# ---------------------------------------------------------------------------
# Priority sort order for the queue: PRIORITY_REVIEW first, then
# SECONDARY_APPROVAL, then STANDARD_QUEUE, then unprocessed (None).
# ---------------------------------------------------------------------------
_ACTION_PRIORITY = case(
    (Referral.action == ReferralAction.PRIORITY_REVIEW, 0),
    (Referral.action == ReferralAction.SECONDARY_APPROVAL, 1),
    (Referral.action == ReferralAction.STANDARD_QUEUE, 2),
    else_=3,
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class IngestRequest(BaseModel):
    s3_key: str
    clinic_id: UUID
    received_at: Optional[datetime] = None


class IngestResponse(BaseModel):
    referral_id: UUID
    status: str = "processing"


class ReferralSummary(BaseModel):
    """Lightweight shape for the queue list view."""
    id: UUID
    clinic_id: UUID
    status: ReferralStatus
    action: Optional[ReferralAction]
    filename: Optional[str]
    referral_reason: Optional[str]
    summary: Optional[str]
    recommended_window: Optional[str]
    missing_information: Optional[list]
    received_at: datetime
    processed_at: Optional[datetime]
    routed_to: Optional[UUID]

    model_config = ConfigDict(from_attributes=True)


class ReferralDetail(BaseModel):
    """Full shape for the detail view."""
    id: UUID
    clinic_id: UUID
    s3_key: str
    status: ReferralStatus
    action: Optional[ReferralAction]

    referral_reason: Optional[str]
    relevant_clinical_findings: Optional[list]
    imaging_summary: Optional[str]
    missing_information: Optional[list]
    provider_urgency_label: Optional[dict]

    matched_criteria: Optional[list]
    evidence: Optional[list]
    provider_label: Optional[str]
    reasoning: Optional[str]

    @computed_field
    @property
    def referring_clinic_classification(self) -> Optional[str]:
        """Raw label string from the referral doc — shown alongside TriageAI's tier."""
        return self.provider_label
    recommended_window: Optional[str]

    next_steps: Optional[str]
    summary: Optional[str]

    model_used: Optional[str]
    processing_time_ms: Optional[int]
    pipeline_version: Optional[str]

    received_at: datetime
    processed_at: Optional[datetime]
    reviewed_at: Optional[datetime]
    reviewed_by: Optional[UUID]
    routed_to: Optional[UUID]
    routed_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StatusUpdate(BaseModel):
    status: ReferralStatus


class RouteRequest(BaseModel):
    physician_id: UUID


class AuditEntry(BaseModel):
    id: UUID
    referral_id: Optional[UUID]
    user_id: Optional[UUID]
    action: str
    old_value: Optional[dict]
    new_value: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_referral_or_404(referral_id: UUID, db: Session) -> Referral:
    referral = db.get(Referral, referral_id)
    if referral is None:
        raise HTTPException(status_code=404, detail="Referral not found")
    return referral


def _assert_clinic_access(referral: Referral, user: User) -> None:
    """Raise 403 if the referral does not belong to the user's clinic."""
    if referral.clinic_id != user.clinic_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/ingest", response_model=IngestResponse, status_code=202)
def ingest(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Accept a new fax referral (identified by its S3 key) and kick off the
    classification pipeline as a background task.

    Called by the fax webhook (Phaxio/Documo) — authenticated separately
    via webhook signature verification (not a user JWT).

    Returns immediately with the referral ID — poll GET /referrals/{id}
    to check when processed_at is set.
    """
    referral = Referral(
        clinic_id=request.clinic_id,
        s3_key=request.s3_key,
        status=ReferralStatus.PENDING,
        received_at=request.received_at or datetime.now(timezone.utc),
    )
    db.add(referral)

    db.add(
        AuditLog(
            referral_id=referral.id,
            user_id=None,
            action="ingested",
            new_value={"s3_key": request.s3_key},
        )
    )
    db.commit()
    db.refresh(referral)

    background_tasks.add_task(process_referral, referral.id, request.s3_key)

    return IngestResponse(referral_id=referral.id)


@router.post("/upload", response_model=IngestResponse, status_code=202)
async def upload(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Accept a PDF uploaded directly from the UI (drag-and-drop).

    Authenticated via Bearer token — clinic_id comes from the JWT, not the request.
    Kicks off the same pipeline as the fax webhook path.
    Returns immediately; poll GET /referrals/{id} until processed_at is set.
    """
    if not file.content_type or file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
    pdf_bytes = await file.read(MAX_FILE_SIZE + 1)
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(pdf_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50 MB.")

    # Pre-generate the referral ID so we can use it as the S3 key.
    referral_id = uuid_lib.uuid4()
    s3_key = f"ui-uploads/{referral_id}.pdf"

    # Upload to S3 before touching the DB so the PDF is durable.
    s3 = boto3.client("s3", region_name=AWS_REGION)
    s3.put_object(Bucket=S3_BUCKET, Key=s3_key, Body=pdf_bytes, ContentType="application/pdf")

    referral = Referral(
        id=referral_id,
        clinic_id=current_user.clinic_id,
        s3_key=s3_key,
        status=ReferralStatus.PENDING,
        received_at=datetime.now(timezone.utc),
    )
    db.add(referral)
    db.flush()

    safe_name = (file.filename or "upload.pdf").replace("/", "_").replace("..", "")
    referral.filename = safe_name
    db.add(
        AuditLog(
            referral_id=referral.id,
            user_id=current_user.id,
            action="uploaded",
            new_value={"filename": safe_name, "bytes": len(pdf_bytes), "s3_key": s3_key},
        )
    )
    db.commit()
    db.refresh(referral)

    background_tasks.add_task(process_referral_from_bytes, referral.id, pdf_bytes)

    return IngestResponse(referral_id=referral.id)


@router.get("", response_model=list[ReferralSummary])
def get_queue(
    status: Optional[ReferralStatus] = Query(default=None),
    action: Optional[ReferralAction] = Query(default=None),
    assigned_to_me: bool = Query(default=False),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the triage queue for the caller's clinic, sorted by clinical
    priority then received_at (oldest first within each tier).

    clinic_id is derived from the authenticated user — callers cannot
    request another clinic's queue.

    assigned_to_me=true: physicians use this to see only their routed cases.
    """
    query = db.query(Referral).filter(Referral.clinic_id == current_user.clinic_id)

    if status is not None:
        query = query.filter(Referral.status == status)
    if action is not None:
        query = query.filter(Referral.action == action)
    if assigned_to_me:
        query = query.filter(Referral.routed_to == current_user.id)

    return (
        query
        .order_by(asc(_ACTION_PRIORITY), asc(Referral.received_at))
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{referral_id}", response_model=ReferralDetail)
def get_referral(
    referral_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full detail for a single referral."""
    referral = _get_referral_or_404(referral_id, db)
    _assert_clinic_access(referral, current_user)

    db.add(
        AuditLog(
            referral_id=referral_id,
            user_id=current_user.id,
            action="viewed",
        )
    )
    db.commit()

    return referral


@router.patch("/{referral_id}/status", response_model=ReferralDetail)
def update_status(
    referral_id: UUID,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update the workflow status of a referral (reviewed / approved / escalated
    / archived). Writes an audit log entry with old and new values.
    """
    referral = _get_referral_or_404(referral_id, db)
    _assert_clinic_access(referral, current_user)

    old_status = referral.status
    referral.status = body.status

    if body.status in (ReferralStatus.REVIEWED, ReferralStatus.APPROVED):
        referral.reviewed_at = datetime.now(timezone.utc)
        referral.reviewed_by = current_user.id

    db.add(
        AuditLog(
            referral_id=referral_id,
            user_id=current_user.id,
            action="status_changed",
            old_value={"status": old_status.value},
            new_value={"status": body.status.value},
        )
    )
    db.commit()
    db.refresh(referral)
    return referral


@router.post("/{referral_id}/route", response_model=ReferralDetail)
def route_referral(
    referral_id: UUID,
    body: RouteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Route a referral to a physician. Only coordinators and admins can route.
    Sets status to ROUTED and records who it was sent to.
    """
    if current_user.role not in (UserRole.COORDINATOR, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only coordinators and admins can route referrals",
        )

    referral = _get_referral_or_404(referral_id, db)
    _assert_clinic_access(referral, current_user)

    physician = db.get(User, body.physician_id)
    if not physician or physician.clinic_id != current_user.clinic_id:
        raise HTTPException(status_code=404, detail="Physician not found")
    if physician.role != UserRole.PHYSICIAN:
        raise HTTPException(status_code=400, detail="Target user is not a physician")

    old_status = referral.status
    referral.status = ReferralStatus.ROUTED
    referral.routed_to = body.physician_id
    referral.routed_at = datetime.now(timezone.utc)

    db.add(
        AuditLog(
            referral_id=referral_id,
            user_id=current_user.id,
            action="routed",
            old_value={"status": old_status.value},
            new_value={"status": ReferralStatus.ROUTED.value, "physician_id": str(body.physician_id)},
        )
    )
    db.commit()
    db.refresh(referral)
    return referral


@router.get("/{referral_id}/pdf")
def get_pdf_url(
    referral_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return a short-lived (15 min) presigned S3 URL for the referral PDF.

    Never streams the PDF through FastAPI — S3 serves it directly.
    Logs access for HIPAA audit trail.
    """
    referral = _get_referral_or_404(referral_id, db)
    _assert_clinic_access(referral, current_user)

    s3 = boto3.client("s3", region_name=AWS_REGION)
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": referral.s3_key},
        ExpiresIn=900,  # 15 minutes
    )

    db.add(
        AuditLog(
            referral_id=referral_id,
            user_id=current_user.id,
            action="pdf_accessed",
        )
    )
    db.commit()

    return {"url": url}


@router.get("/{referral_id}/audit", response_model=list[AuditEntry])
def get_audit_trail(
    referral_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the full audit trail for a referral, ordered chronologically.
    Required for HIPAA compliance (6-year retention).
    """
    referral = _get_referral_or_404(referral_id, db)
    _assert_clinic_access(referral, current_user)

    return (
        db.query(AuditLog)
        .filter(AuditLog.referral_id == referral_id)
        .order_by(asc(AuditLog.created_at))
        .all()
    )
