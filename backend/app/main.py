import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.database import engine, Base, SessionLocal
from backend.app.services.seed_service import seed_database
from backend.app.api import (
    auth, overview, reconciliation, exceptions, customers,
    billing, unit_economics, ai, data_management, settings as app_settings,
    global_search
)

# Initialize database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        # Check if database is empty; if so, populate synthetic demonstration dataset
        seed_database(db, force_reset=False)
    finally:
        db.close()

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

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database": "connected"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
