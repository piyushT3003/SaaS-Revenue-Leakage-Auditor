"""Database engine, session factory and transaction helpers."""
from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from backend.app.core.config import settings

if settings.DB_POOL_MODE == "null":
    engine = create_engine(settings.DATABASE_URL, poolclass=NullPool, future=True)
else:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        future=True,
    )


@event.listens_for(engine, "connect")
def _set_statement_timeout(dbapi_conn, _record):  # pragma: no cover - driver hook
    with dbapi_conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = {int(settings.DB_STATEMENT_TIMEOUT_MS)}")
        cur.execute("SET TIME ZONE 'UTC'")
    dbapi_conn.commit()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request; rolled back on error."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for background jobs and scripts."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
