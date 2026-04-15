"""Widen recommended_window from String(100) to Text

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "referrals",
        "recommended_window",
        type_=sa.Text,
        existing_type=sa.String(100),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "referrals",
        "recommended_window",
        type_=sa.String(100),
        existing_type=sa.Text,
        existing_nullable=True,
    )
