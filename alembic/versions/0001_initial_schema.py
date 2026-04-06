"""Initial schema — clinics, users, referrals, audit_log

Revision ID: 0001
Revises:
Create Date: 2026-04-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- clinics ---
    op.create_table(
        "clinics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("specialty", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("clinic_id", UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("auth_provider_id", sa.String(255), unique=True, nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_clinic_id", "users", ["clinic_id"])

    # --- referrals ---
    op.create_table(
        "referrals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("clinic_id", UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("s3_key", sa.String(1024), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        # Extraction fields
        sa.Column("referral_reason", sa.Text, nullable=True),
        sa.Column("relevant_clinical_findings", JSONB, nullable=True),
        sa.Column("imaging_summary", sa.Text, nullable=True),
        sa.Column("missing_information", JSONB, nullable=True),
        sa.Column("provider_urgency_label", JSONB, nullable=True),
        # Classification fields
        sa.Column("action", sa.String(50), nullable=True),
        sa.Column("matched_criteria", JSONB, nullable=True),
        sa.Column("evidence", JSONB, nullable=True),
        sa.Column("provider_label", sa.Text, nullable=True),
        sa.Column("reasoning", sa.Text, nullable=True),
        sa.Column("recommended_window", sa.String(100), nullable=True),
        # Coordinator-facing fields
        sa.Column("next_steps", sa.Text, nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        # Processing metadata
        sa.Column("model_used", sa.String(100), nullable=True),
        sa.Column("processing_time_ms", sa.Integer, nullable=True),
        sa.Column("pipeline_version", sa.String(20), nullable=True),
        # Timestamps
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_referrals_clinic_id", "referrals", ["clinic_id"])
    op.create_index("ix_referrals_status", "referrals", ["status"])
    op.create_index("ix_referrals_action", "referrals", ["action"])
    op.create_index("ix_referrals_received_at", "referrals", ["received_at"])

    # --- audit_log ---
    op.create_table(
        "audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("referral_id", UUID(as_uuid=True), sa.ForeignKey("referrals.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("old_value", JSONB, nullable=True),
        sa.Column("new_value", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_audit_log_referral_id", "audit_log", ["referral_id"])
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("referrals")
    op.drop_table("users")
    op.drop_table("clinics")
