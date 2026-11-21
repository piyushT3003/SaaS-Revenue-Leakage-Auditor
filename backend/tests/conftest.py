"""Test harness: a real PostgreSQL test database, migrated with Alembic, truncated per test."""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/sra_test")
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 40)

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from backend.app.core.database import SessionLocal, engine  # noqa: E402
from backend.app.models import Base, Role, User  # noqa: E402
from backend.app.security.auth import hash_password  # noqa: E402
from backend.app.services.tenancy import ensure_roles, ensure_tenant  # noqa: E402

PASSWORD = "Test-Pass-12345"


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    assert "sra_test" in str(engine.url), "tests must run against the dedicated sra_test database"
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_tables(migrated_db):
    tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db = SessionLocal()
    roles = ensure_roles(db)
    tenant = ensure_tenant(db)
    for email, name, role in (("admin@test.local", "Test Admin", "ADMIN"), ("analyst@test.local", "Test Analyst", "ANALYST"),
                              ("viewer@test.local", "Test Viewer", "VIEWER")):
        db.add(User(tenant_id=tenant.id, email=email, full_name=name, password_hash=hash_password(PASSWORD), role_id=roles[role].id))
    db.commit()
    db.close()
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


@pytest.fixture
def client():
    from backend.app.main import app

    with TestClient(app) as c:
        yield c


def _login(client, email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return _login(client, "admin@test.local")


@pytest.fixture
def analyst(client):
    return _login(client, "analyst@test.local")


@pytest.fixture
def viewer(client):
    return _login(client, "viewer@test.local")


@pytest.fixture
def tenant_id(db):
    from backend.app.models import Tenant

    return db.query(Tenant).one().id
