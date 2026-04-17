"""Add slug column to clinics for subdomain-based routing

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clinics", sa.Column("slug", sa.String(63), nullable=True))
    op.execute(
        "UPDATE clinics SET slug = 'sacent' WHERE id = '00000000-0000-0000-0000-000000000001'"
    )
    op.alter_column("clinics", "slug", nullable=False)
    op.create_unique_constraint("uq_clinics_slug", "clinics", ["slug"])


def downgrade() -> None:
    op.drop_constraint("uq_clinics_slug", "clinics", type_="unique")
    op.drop_column("clinics", "slug")
