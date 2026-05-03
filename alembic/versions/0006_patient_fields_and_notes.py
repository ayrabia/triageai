"""Add patient fields to referrals and create referral_notes table

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("referrals", sa.Column("patient_name", sa.String(255), nullable=True))
    op.add_column("referrals", sa.Column("patient_dob", sa.String(50), nullable=True))
    op.add_column("referrals", sa.Column("referring_provider", sa.String(255), nullable=True))

    op.create_table(
        "referral_notes",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "referral_id",
            UUID(as_uuid=False),
            sa.ForeignKey("referrals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "clinic_id",
            UUID(as_uuid=False),
            sa.ForeignKey("clinics.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("author_name", sa.String(255), nullable=False),
        sa.Column("author_role", sa.String(50), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_referral_notes_referral_id", "referral_notes", ["referral_id"])
    op.create_index("ix_referral_notes_clinic_id", "referral_notes", ["clinic_id"])


def downgrade() -> None:
    op.drop_index("ix_referral_notes_clinic_id", "referral_notes")
    op.drop_index("ix_referral_notes_referral_id", "referral_notes")
    op.drop_table("referral_notes")
    op.drop_column("referrals", "referring_provider")
    op.drop_column("referrals", "patient_dob")
    op.drop_column("referrals", "patient_name")
