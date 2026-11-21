"""immutability guards: allow a deliberate, transaction-scoped workspace erasure

Normal application code can still never UPDATE/DELETE results or finalised audit runs. Only a transaction that
runs `SET LOCAL sra.erasure = 'on'` (used solely by the admin "Erase all company data" action, which requires the
admin's password and a typed confirmation) may delete them.

Revision ID: 0007
Revises: 0006
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE OR REPLACE FUNCTION sra_reject_mutation() RETURNS trigger AS $$
    BEGIN
        IF TG_OP = 'DELETE' AND current_setting('sra.erasure', true) = 'on' THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
            USING ERRCODE = 'restrict_violation';
    END; $$ LANGUAGE plpgsql;
    """)
    op.execute("""
    CREATE OR REPLACE FUNCTION sra_protect_completed_audit_run() RETURNS trigger AS $$
    BEGIN
        IF TG_OP = 'DELETE' THEN
            IF current_setting('sra.erasure', true) = 'on' THEN
                RETURN OLD;
            END IF;
            RAISE EXCEPTION 'Audit runs cannot be deleted' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status IN ('COMPLETED', 'COMPLETED_WITH_EXCLUSIONS', 'FAILED') THEN
            RAISE EXCEPTION 'Audit run % is finalised and immutable', OLD.run_code USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    op.execute("""
    CREATE OR REPLACE FUNCTION sra_reject_mutation() RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
            USING ERRCODE = 'restrict_violation';
    END; $$ LANGUAGE plpgsql;
    """)
    op.execute("""
    CREATE OR REPLACE FUNCTION sra_protect_completed_audit_run() RETURNS trigger AS $$
    BEGIN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Audit runs cannot be deleted' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status IN ('COMPLETED', 'COMPLETED_WITH_EXCLUSIONS', 'FAILED') THEN
            RAISE EXCEPTION 'Audit run % is finalised and immutable', OLD.run_code USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    """)
