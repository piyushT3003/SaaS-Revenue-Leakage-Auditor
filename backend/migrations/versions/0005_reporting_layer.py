"""reporting layer for Power BI (views, snapshot tables, read-only role)

Revision ID: 0005
Revises: 0004
"""
from pathlib import Path

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql = (Path(__file__).resolve().parents[2] / "app" / "reporting" / "views.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    # Roles are cluster-wide (shared by every database on the server), so the powerbi_reader role is left in place;
    # dropping the schema removes every grant it had in this database.
    op.execute("DROP SCHEMA IF EXISTS reporting CASCADE")
