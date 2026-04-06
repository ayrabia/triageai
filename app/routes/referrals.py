"""
Referral routes — the core of the TriageAI API.

Endpoints:
  POST   /referrals/ingest          — ingest a new fax, kick off pipeline
  GET    /referrals/                — paginated queue (filterable by action/status)
  GET    /referrals/{id}            — full detail for one referral
  PATCH  /referrals/{id}/status     — coordinator marks reviewed/approved/escalated
  GET    /referrals/{id}/audit      — HIPAA audit trail for a referral
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import asc, case, desc
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from db.enums import ReferralAction, ReferralStatus
from db.models import AuditLog, Referral
from pipeline.run import process_referral

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
    # Defaults to now if not provided (e.g. fax timestamp from Phaxio webhook)
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
    referral_reason: Optional[str]
    summary: Optional[str]
    recommended_window: Optional[str]
    missing_information: Optional[list]
    received_at: datetime
    processed_at: Optional[datetime]

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
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StatusUpdate(BaseModel):
    status: ReferralStatus


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
    v3 classification pipeline as a background task.

    Returns immediately with the referral ID — the caller can poll
    GET /referrals/{id} to check when processed_at is set.
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


@router.get("/", response_model=list[ReferralSummary])
def get_queue(
    clinic_id: UUID = Query(..., description="Clinic to fetch the queue for"),
    status: Optional[ReferralStatus] = Query(default=None),
    action: Optional[ReferralAction] = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Return the triage queue for a clinic, sorted by clinical priority then
    received_at (oldest first within each tier).

    Filter by status (e.g. pending only) or action tier as needed.
    """
    query = db.query(Referral).filter(Referral.clinic_id == clinic_id)

    if status is not None:
        query = query.filter(Referral.status == status)
    if action is not None:
        query = query.filter(Referral.action == action)

    referrals = (
        query
        .order_by(asc(_ACTION_PRIORITY), asc(Referral.received_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    return referrals


@router.get("/{referral_id}", response_model=ReferralDetail)
def get_referral(
    referral_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return full detail for a single referral."""
    referral = db.get(Referral, referral_id)
    if referral is None:
        raise HTTPException(status_code=404, detail="Referral not found")

    # Audit the view
    db.add(
        AuditLog(
            referral_id=referral_id,
            user_id=current_user.id if current_user else None,
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
    current_user=Depends(get_current_user),
):
    """
    Update the workflow status of a referral (reviewed / approved / escalated
    / archived). Writes an audit log entry with old and new values.
    """
    referral = db.get(Referral, referral_id)
    if referral is None:
        raise HTTPException(status_code=404, detail="Referral not found")

    old_status = referral.status
    referral.status = body.status

    if body.status in (ReferralStatus.REVIEWED, ReferralStatus.APPROVED):
        referral.reviewed_at = datetime.now(timezone.utc)
        referral.reviewed_by = current_user.id if current_user else None

    db.add(
        AuditLog(
            referral_id=referral_id,
            user_id=current_user.id if current_user else None,
            action="status_changed",
            old_value={"status": old_status.value},
            new_value={"status": body.status.value},
        )
    )
    db.commit()
    db.refresh(referral)
    return referral


@router.get("/{referral_id}/audit", response_model=list[AuditEntry])
def get_audit_trail(
    referral_id: UUID,
    db: Session = Depends(get_db),
):
    """
    Return the full audit trail for a referral, ordered chronologically.
    Required for HIPAA compliance (6-year retention).
    """
    referral = db.get(Referral, referral_id)
    if referral is None:
        raise HTTPException(status_code=404, detail="Referral not found")

    entries = (
        db.query(AuditLog)
        .filter(AuditLog.referral_id == referral_id)
        .order_by(asc(AuditLog.created_at))
        .all()
    )
    return entries
