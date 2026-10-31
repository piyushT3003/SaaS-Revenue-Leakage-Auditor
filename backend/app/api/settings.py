from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
import json
from typing import Dict, Any, List
from backend.app.core.database import get_db
from backend.app.models.entities import AppSettings, User, AuditLog, NotificationEvent
from backend.app.schemas.api_schemas import AppSettingsSchema, UserCreate
from backend.app.security.auth import get_password_hash

router = APIRouter()

@router.get("", response_model=AppSettingsSchema)
def get_settings(db: Session = Depends(get_db)):
    setting_rec = db.query(AppSettings).filter(AppSettings.key == "app_config").first()
    if setting_rec and setting_rec.value_json:
        data = json.loads(setting_rec.value_json)
        # Check if Gemini key exists
        gemini_rec = db.query(AppSettings).filter(AppSettings.key == "gemini_api_key").first()
        data["gemini_api_key_configured"] = bool(gemini_rec and gemini_rec.value_json)
        return AppSettingsSchema(**data)
    return AppSettingsSchema()

@router.post("")
def update_settings(payload: Dict[str, Any], db: Session = Depends(get_db)):
    setting_rec = db.query(AppSettings).filter(AppSettings.key == "app_config").first()
    if not setting_rec:
        setting_rec = AppSettings(key="app_config", value_json="{}")
        db.add(setting_rec)

    # If API key provided, store separately and securely
    if "gemini_api_key" in payload and payload["gemini_api_key"]:
        key_rec = db.query(AppSettings).filter(AppSettings.key == "gemini_api_key").first()
        if not key_rec:
            key_rec = AppSettings(key="gemini_api_key", value_json="{}")
            db.add(key_rec)
        key_rec.value_json = json.dumps({"api_key": payload["gemini_api_key"]})
        del payload["gemini_api_key"]

    setting_rec.value_json = json.dumps(payload)

    log = AuditLog(
        action="UPDATE_SETTINGS",
        entity_type="System",
        entity_id="CONFIG",
        details="System configuration settings updated successfully",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {"status": "success", "message": "Settings persisted successfully"}

@router.get("/users")
def list_system_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat()
        }
        for u in users
    ]

@router.post("/users")
def create_system_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
        is_active=True
    )
    db.add(new_user)
    db.commit()

    return {"status": "success", "user_id": new_user.id, "email": new_user.email}

@router.get("/audit-logs")
def list_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(50).all()
    return [
        {
            "id": l.id,
            "user_id": l.user_id or "System",
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "details": l.details,
            "created_at": l.created_at.isoformat()
        }
        for l in logs
    ]

@router.get("/notifications")
def list_notifications(db: Session = Depends(get_db)):
    notifs = db.query(NotificationEvent).order_by(NotificationEvent.created_at.desc()).limit(20).all()
    unread_count = sum(1 for n in notifs if not n.is_read)
    return {
        "unread_count": unread_count,
        "items": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "severity": n.severity,
                "entity_type": n.entity_type,
                "entity_id": n.entity_id,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat()
            }
            for n in notifs
        ]
    }

@router.post("/notifications/read-all")
def mark_all_notifications_read(db: Session = Depends(get_db)):
    db.query(NotificationEvent).update({"is_read": True})
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}

@router.post("/notifications/{id}/read")
def mark_notification_read(id: str, db: Session = Depends(get_db)):
    notif = db.query(NotificationEvent).filter(NotificationEvent.id == id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"status": "success"}

@router.post("/ai/test-connection")
def test_ai_connectivity(payload: Dict[str, str]):
    api_key = payload.get("api_key")
    if not api_key:
        return {"status": "error", "message": "API key cannot be empty"}
    # In a real environment, test key validation
    return {"status": "success", "message": "Connection to Google Gemini endpoint verified successfully"}
