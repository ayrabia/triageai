"""Add scheduling_window, physician_note, escalated_by to referrals

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("referrals", sa.Column("scheduling_window", sa.String(100), nullable=True))
    op.add_column("referrals", sa.Column("physician_note", sa.Text, nullable=True))
    op.add_column("referrals", sa.Column("escalated_by", UUID(as_uuid=False), nullable=True))
    op.create_foreign_key(
        "fk_referrals_escalated_by",
        "referrals",
        "users",
        ["escalated_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_referrals_escalated_by", "referrals", type_="foreignkey")
    op.drop_column("referrals", "escalated_by")
    op.drop_column("referrals", "physician_note")
    op.drop_column("referrals", "scheduling_window")
