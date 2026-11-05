import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from backend.app.core.config import settings
from backend.app.core.database import engine, Base, SessionLocal
from backend.app.core.middleware import StructuredLoggingAndRateLimitMiddleware
from backend.app.services.seed_service import seed_database
from backend.app.api import (
    auth, overview, reconciliation, exceptions, customers,
    billing, unit_economics, ai, data_management, settings as app_settings,
    global_search, advanced_features
)

# Initialize database schema
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist and seed default synthetic dataset if database is fresh
    db = SessionLocal()
    try:
        seed_database(db, force_reset=False)
    finally:
        db.close()
    yield
    # Shutdown logic

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Add structured logging & rate limiting middleware
app.add_middleware(StructuredLoggingAndRateLimitMiddleware)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(overview.router, prefix=f"{settings.API_V1_STR}/overview", tags=["Executive Overview"])
app.include_router(reconciliation.router, prefix=f"{settings.API_V1_STR}/reconciliation", tags=["Revenue Reconciliation"])
app.include_router(exceptions.router, prefix=f"{settings.API_V1_STR}/exceptions", tags=["Exception Management"])
app.include_router(customers.router, prefix=f"{settings.API_V1_STR}/customers", tags=["Customer Intelligence"])
app.include_router(billing.router, prefix=f"{settings.API_V1_STR}/billing", tags=["Billing & Payments"])
app.include_router(unit_economics.router, prefix=f"{settings.API_V1_STR}/unit-economics", tags=["Customer Unit Economics"])
app.include_router(ai.router, prefix=f"{settings.API_V1_STR}/ai", tags=["AI Investigation Assistant"])
app.include_router(data_management.router, prefix=f"{settings.API_V1_STR}/data", tags=["Data Management"])
app.include_router(app_settings.router, prefix=f"{settings.API_V1_STR}/settings", tags=["Settings & Audit"])
app.include_router(global_search.router, prefix=f"{settings.API_V1_STR}/search", tags=["Global Search"])
app.include_router(advanced_features.router, prefix=f"{settings.API_V1_STR}", tags=["Advanced Capabilities"])

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database": "connected"
    }

@app.get("/api/health/live")
def liveness_check():
    return {
        "status": "alive",
        "service": settings.PROJECT_NAME
    }

@app.get("/api/health/ready")
def readiness_check():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "ready",
            "service": settings.PROJECT_NAME,
            "database": "operational",
            "pool_checked": True
        }
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "unavailable",
                "error": str(exc)
            }
        )
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8085))
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=port, reload=True)
