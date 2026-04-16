"""
SQLAlchemy ORM models for TriageAI.

Tables:
  clinics    — one row per clinic (multi-tenant isolation)
  users      — staff accounts, scoped to a clinic
  referrals  — one row per processed fax; stores all pipeline output
  audit_log  — append-only HIPAA audit trail (6-year retention)
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from db.enums import ReferralAction, ReferralStatus, UserRole


class Base(DeclarativeBase):
    pass


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    specialty: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "ENT"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    users: Mapped[list["User"]] = relationship("User", back_populates="clinic")
    referrals: Mapped[list["Referral"]] = relationship("Referral", back_populates="clinic")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    # Auth0 or Cognito subject identifier — used to look up the user on JWT verification
    auth_provider_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, native_enum=False), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    clinic: Mapped["Clinic"] = relationship("Clinic", back_populates="users")
    audit_entries: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")


class Referral(Base):
    __tablename__ = "referrals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    # S3 key for the original fax PDF (AES-256 SSE enforced at bucket level)
    s3_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    # Original filename from the upload or fax system
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[ReferralStatus] = mapped_column(
        SAEnum(ReferralStatus, native_enum=False),
        nullable=False,
        default=ReferralStatus.PENDING,
    )

    # --- Pipeline output: extraction fields ---
    # Claude's answer to "why was this patient referred?"
    referral_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ["symptom 1", "symptom 2", ...]
    relevant_clinical_findings: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Summarized imaging findings, or null
    imaging_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ["Missing CT report", ...]
    missing_information: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # {"label": "urgent", "source": "Priority field top of form"}
    provider_urgency_label: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- Pipeline output: classification fields ---
    action: Mapped[ReferralAction | None] = mapped_column(
        SAEnum(ReferralAction, native_enum=False), nullable=True
    )
    # ["Confirmed or suspected cancer / malignancy"]
    matched_criteria: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # ["exact text from document that triggered the match"]
    evidence: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # What the provider label said (raw string from the document)
    provider_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    # One sentence: why this tier was assigned
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    # e.g. "3-4 weeks" for Tier 1, null for Tier 2/3
    recommended_window: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Pipeline output: coordinator-facing fields ---
    next_steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Processing metadata ---
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pipeline_version: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- Timestamps ---
    # When the fax arrived in S3 / was submitted
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # When Claude finished processing (null until pipeline completes)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # When a coordinator marked this reviewed
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # When a coordinator routed this to a physician
    routed_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    routed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    clinic: Mapped["Clinic"] = relationship("Clinic", back_populates="referrals")
    audit_log: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="referral")


class AuditLog(Base):
    """
    Append-only audit trail. Never update or delete rows — HIPAA requires
    6-year retention. Use DB-level grants to enforce INSERT-only for app user.

    Recorded actions: viewed, status_changed, escalated, exported, login, etc.
    """

    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    referral_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referrals.id", ondelete="RESTRICT"), nullable=True
    )
    # Null for system-generated events (e.g. pipeline completion)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    old_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)  # IPv6 max 45 chars
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    referral: Mapped["Referral | None"] = relationship("Referral", back_populates="audit_log")
    user: Mapped["User | None"] = relationship("User", back_populates="audit_entries")
