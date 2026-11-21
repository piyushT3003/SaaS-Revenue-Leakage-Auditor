"""FastAPI application — modular monolith entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from backend.app.api import (
    admin, advanced, ai, audits, auth, billing, cron, customers, exceptions, imports, metrics, monitoring, overview,
    unit_economics,
)
from backend.app.core.config import settings
from backend.app.core.database import SessionLocal, session_scope
from backend.app.core.logging import RequestContextMiddleware, configure_logging, log, request_id_var
from backend.app.core.monitoring import init_monitoring


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")


STARTUP_LOCK = 72_640_001  # pg advisory-lock key: one instance at a time runs migrations and seeding


def _startup_tasks() -> None:
    """Migrate, bootstrap and (optionally) seed. Serverless hosts may start several instances at once, so the
    whole sequence runs under a Postgres advisory lock; every step is idempotent, so later instances do nothing."""
    from sqlalchemy import text as sql

    from backend.app.core.database import engine
    from backend.app.seed.synthetic import demo_users, seed_demo_dataset
    from backend.app.services.tenancy import bootstrap

    with engine.connect() as lock_conn:
        lock_conn.execute(sql("SELECT pg_advisory_lock(:k)"), {"k": STARTUP_LOCK})
        try:
            if settings.AUTO_MIGRATE:
                run_migrations()
            with session_scope() as db:
                tenant, generated = bootstrap(db)
                if generated:
                    # Printed once to the server console only; never returned by any API.
                    print(f"\n*** Bootstrap admin {settings.BOOTSTRAP_ADMIN_EMAIL} created. One-time password: {generated}\n", flush=True)
                if settings.SEED_DEMO_DATA_ON_START:
                    if settings.DEMO_USER_PASSWORD:
                        demo_users(db, tenant, settings.DEMO_USER_PASSWORD)
                    seed_demo_dataset(db, tenant)
                tenant_id = tenant.id
            if settings.SEED_DEMO_DATA_ON_START and settings.SEED_DEMO_RUN_AUDITS:
                from backend.app.seed.cli import run_demo_audits

                run_demo_audits(tenant_id)  # skips months that already have a completed audit
        finally:
            lock_conn.execute(sql("SELECT pg_advisory_unlock(:k)"), {"k": STARTUP_LOCK})


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    if settings.ENVIRONMENT != "test":
        _startup_tasks()
        from backend.app.reconciliation.runner import recover_stale_runs

        with session_scope() as db:
            recover_stale_runs(db)
    yield


init_monitoring()  # no-op unless SENTRY_DSN is set; must run before the app is created

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_SUBTITLE,
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None,  # served below from local assets (no CDN dependency)
    redoc_url=None,
)
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
# Swagger UI (vendored, same-origin) needs its own bundle plus FastAPI's inline initialiser.
DOCS_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")


# Same policy nginx / vercel.json send for the single-page app (when the API process serves the built frontend).
SPA_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
           "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; "
           "form-action 'self'; object-src 'none'")


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "no-referrer")
    h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    path = request.url.path
    if path == "/docs" or path.startswith("/docs-assets"):
        csp = DOCS_CSP
    elif path.startswith("/api/"):
        csp = API_CSP
    else:
        csp = SPA_CSP
    h.setdefault("Content-Security-Policy", csp)
    if path.startswith("/api/"):
        h.setdefault("Cache-Control", "no-store")  # financial data must not sit in shared or browser caches
    if settings.ENVIRONMENT == "production":
        h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


@app.exception_handler(RequestValidationError)
async def _validation(_: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Validation failed", "errors": errors})


@app.exception_handler(DBAPIError)
async def _db_error(_: Request, exc: DBAPIError):
    log.exception("database error")
    msg = "The database rejected the operation" if "restrict_violation" not in str(exc.orig) else str(exc.orig).split("\n")[0]
    return JSONResponse(status_code=409 if "violation" in str(exc.orig) else 503,
                        content={"detail": msg, "request_id": request_id_var.get()})


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception):
    log.exception("unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "request_id": request_id_var.get()})


API = settings.API_V1_STR
app.include_router(auth.router, prefix=f"{API}/auth", tags=["Authentication"])
app.include_router(imports.router, prefix=f"{API}/imports", tags=["Data Management"])
app.include_router(audits.router, prefix=f"{API}/audits", tags=["Revenue Reconciliation"])
app.include_router(metrics.router, prefix=f"{API}/metrics", tags=["Financial Metrics"])
app.include_router(exceptions.router, prefix=f"{API}/exceptions", tags=["Exception Management"])
app.include_router(overview.router, prefix=API, tags=["Executive Overview"])
app.include_router(customers.router, prefix=API, tags=["Customer Intelligence"])
app.include_router(billing.router, prefix=API, tags=["Billing & Payments"])
app.include_router(unit_economics.router, prefix=API, tags=["Customer Unit Economics"])
app.include_router(admin.router, prefix=API, tags=["Settings & Administration"])
app.include_router(advanced.router, prefix=API, tags=["Advanced Revenue Assurance"])
app.include_router(ai.router, prefix=API, tags=["AI Investigation Assistant"])
app.include_router(cron.router, prefix=API, tags=["Scheduled jobs"])
app.include_router(monitoring.router, prefix=API, tags=["Monitoring"])


if settings.ENVIRONMENT != "production":
    try:  # self-hosted Swagger UI 5 (vendored, MIT) so the docs work offline / behind restrictive networks
        from fastapi.openapi.docs import get_swagger_ui_html
        from fastapi.staticfiles import StaticFiles
        app.mount("/docs-assets", StaticFiles(directory=Path(__file__).parent / "static" / "swagger"), name="docs-assets")

        @app.get("/docs", include_in_schema=False)
        def docs():
            return get_swagger_ui_html(openapi_url=app.openapi_url, title=f"{settings.PROJECT_NAME} — API",
                                       swagger_js_url="/docs-assets/swagger-ui-bundle.js",
                                       swagger_css_url="/docs-assets/swagger-ui.css",
                                       swagger_ui_parameters={"persistAuthorization": True})
    except (ImportError, RuntimeError):  # pragma: no cover
        pass


@app.get("/api/health/live", tags=["Health"])
def live():
    return {"status": "alive"}


@app.get("/api/health/ready", tags=["Health"])
def ready():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        version = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        return {"status": "ready", "database": "postgresql", "schema_revision": version}
    except Exception as exc:  # pragma: no cover - exercised when the DB is down
        return JSONResponse(status_code=503, content={"status": "unavailable", "error": type(exc).__name__})
    finally:
        db.close()


# Serve the built frontend from this process when it has been built (single-deployment hosts such as Vercel,
# where it is promoted to the CDN). API routes always win; unknown navigation paths fall back to index.html
# for client-side routing. Development uses the Vite server; Docker uses nginx.
@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(rest: str):
    """Unknown API paths are a JSON 404, never the SPA's index.html."""
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if settings.SERVE_FRONTEND and hasattr(app, "frontend") and (FRONTEND_DIST / "index.html").exists():
    app.frontend("/", directory=FRONTEND_DIST, fallback="index.html")
