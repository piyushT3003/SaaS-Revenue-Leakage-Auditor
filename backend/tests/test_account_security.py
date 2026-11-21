"""Account security: password change, password reset (email and admin link), shared login throttle,
session idle timeout and the read-only demo login."""
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from sqlalchemy import text

from backend.app.core.config import settings
from backend.tests.conftest import PASSWORD

NEW = "New-Pass-67890"


def _login(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _bearer(r):
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_change_password_requires_current_and_signs_out_other_devices(client):
    other = _bearer(_login(client, "analyst@test.local"))
    me = _bearer(_login(client, "analyst@test.local"))
    bad = client.post("/api/v1/auth/change-password", headers=me, json={"current_password": "nope-nope-1", "new_password": NEW})
    assert bad.status_code == 400
    weak = client.post("/api/v1/auth/change-password", headers=me, json={"current_password": PASSWORD, "new_password": "abcdefghijk"})
    assert weak.status_code == 422
    ok = client.post("/api/v1/auth/change-password", headers=me, json={"current_password": PASSWORD, "new_password": NEW})
    assert ok.status_code == 200
    assert client.get("/api/v1/auth/me", headers=me).status_code == 200      # this device stays signed in
    assert client.get("/api/v1/auth/me", headers=other).status_code == 401   # every other device is signed out
    assert _login(client, "analyst@test.local").status_code == 401
    assert _login(client, "analyst@test.local", NEW).status_code == 200


def test_admin_reset_link_is_one_time_and_revokes_sessions(client, admin, db):
    victim = _bearer(_login(client, "viewer@test.local"))
    uid = db.execute(text("select id from users where email='viewer@test.local'")).scalar()
    r = client.post(f"/api/v1/users/{uid}/reset-link", headers=admin)
    assert r.status_code == 201
    token = parse_qs(urlparse(r.json()["url"]).query)["token"][0]
    # only the hash is stored
    assert db.execute(text("select count(*) from password_reset_tokens where token_hash = :t"), {"t": token}).scalar() == 0
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": NEW}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=victim).status_code == 401
    assert _login(client, "viewer@test.local", NEW).status_code == 200
    again = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Other-Pass-111"})
    assert again.status_code == 400  # one-time


def test_reset_link_expires_and_non_admin_cannot_issue(client, admin, analyst, db):
    uid = db.execute(text("select id from users where email='viewer@test.local'")).scalar()
    assert client.post(f"/api/v1/users/{uid}/reset-link", headers=analyst).status_code == 403
    token = parse_qs(urlparse(client.post(f"/api/v1/users/{uid}/reset-link", headers=admin).json()["url"]).query)["token"][0]
    db.execute(text("update password_reset_tokens set expires_at = now() - interval '1 minute'"))
    db.commit()
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": NEW}).status_code == 400


def test_forgot_password_never_reveals_whether_an_account_exists(client, monkeypatch):
    sent = []
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(settings, "EMAIL_FROM", "no-reply@example.test")
    monkeypatch.setattr("backend.app.api.auth.send_email", lambda to, subject, body: sent.append((to, body)) or True)
    a = client.post("/api/v1/auth/forgot-password", json={"email": "admin@test.local"})
    b = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@test.local"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()
    assert [to for to, _ in sent] == ["admin@test.local"]
    token = re.search(r"token=([\w-]+)", sent[0][1]).group(1)
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": NEW}).status_code == 200


def test_login_throttle_is_shared_through_the_database(client, db, monkeypatch):
    monkeypatch.setattr(settings, "LOGIN_MAX_ATTEMPTS_PER_MINUTE", 3)
    for _ in range(3):
        assert _login(client, "admin@test.local", "wrong-password-1").status_code == 401
    assert _login(client, "admin@test.local", "wrong-password-1").status_code == 429
    # stored in the database, so every API process / serverless instance sees the same count
    assert db.execute(text("select count(*) from login_attempts where key = 'login:admin@test.local'")).scalar() == 3


def test_idle_session_expires(client, db):
    h = _bearer(_login(client, "viewer@test.local"))
    assert client.get("/api/v1/auth/me", headers=h).status_code == 200
    idle = datetime.now(UTC) - timedelta(minutes=settings.SESSION_IDLE_MINUTES + 1)
    db.execute(text("update user_sessions set last_seen_at = :t, issued_at = :t"), {"t": idle})
    db.commit()
    r = client.get("/api/v1/auth/me", headers=h)
    assert r.status_code == 401 and "inactivity" in r.json()["detail"]


def test_demo_login_is_off_by_default_and_read_only_when_on(client, monkeypatch):
    assert client.get("/api/v1/auth/options").json()["demo_login"] is False
    assert client.post("/api/v1/auth/demo-login").status_code == 404
    monkeypatch.setattr(settings, "DEMO_LOGIN_EMAIL", "admin@test.local")
    assert client.post("/api/v1/auth/demo-login").status_code == 403  # never hands out write access
    monkeypatch.setattr(settings, "DEMO_LOGIN_EMAIL", "viewer@test.local")
    r = client.post("/api/v1/auth/demo-login")
    assert r.status_code == 200 and r.json()["user"]["role"] == "VIEWER"
    assert client.post("/api/v1/audits", headers=_bearer(r), json={"period_start": "2026-10-01", "period_end": "2026-10-31"}).status_code == 403


def test_onboarding_status_guides_an_empty_workspace(client, viewer):
    r = client.get("/api/v1/onboarding/status", headers=viewer)
    assert r.status_code == 200
    d = r.json()
    assert d["complete"] is False and d["ready_to_audit"] is False and d["completed_audits"] == 0
    assert [s["key"] for s in d["steps"]][:3] == ["customers", "products", "contracts"]
    assert all(s["count"] == 0 for s in d["steps"])


def test_inline_audit_execution_finishes_before_responding(client, admin, db, monkeypatch):
    from backend.tests.factories import World

    w = World(db, db.execute(text("select id from tenants limit 1")).scalar())
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, total=8000), s, "8000")
    db.commit()
    monkeypatch.setattr(settings, "AUDIT_EXECUTION", "inline")
    r = client.post("/api/v1/audits", headers=admin, json={"period_start": "2026-10-01", "period_end": "2026-10-31", "as_of_date": "2026-11-14"})
    assert r.status_code == 202 and r.json()["status"] in ("COMPLETED", "COMPLETED_WITH_EXCLUSIONS")


def test_unknown_api_paths_are_json_404(client):
    r = client.get("/api/v1/definitely-not-here", headers={"Accept": "text/html"})
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")


def test_demo_mode_opens_without_credentials_and_protects_the_shared_account(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_LOGIN_EMAIL", "viewer@test.local")
    monkeypatch.setattr(settings, "DEMO_AUTO_LOGIN", True)
    opts = client.get("/api/v1/auth/options").json()
    assert opts["demo_auto"] is True and opts["demo_email"] == "viewer@test.local"
    r = client.post("/api/v1/auth/demo-login")  # no email, no password
    assert r.status_code == 200
    h = _bearer(r)
    assert client.get("/api/v1/metrics/reference", headers=h).status_code == 200  # can read every page's data
    bad = client.post("/api/v1/auth/change-password", headers=h, json={"current_password": PASSWORD, "new_password": NEW})
    assert bad.status_code == 403  # nobody can lock other visitors out of the demo


def test_alert_emails_go_to_admins_after_commit_only_when_enabled(db, tenant_id, monkeypatch):
    from backend.app.services.settings import update_setting
    from backend.app.services.tenancy import notify

    sent = []
    monkeypatch.setattr("backend.app.services.email.send_email", lambda to, subject, body: sent.append((to, subject)) or True)
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(settings, "EMAIL_FROM", "alerts@example.test")
    notify(db, tenant_id, "AUDIT", "Audit X failed", "boom", severity="ERROR")
    db.commit()
    assert sent == []  # workspace has not turned email notifications on
    update_setting(db, tenant_id, None, "notifications", {"email_notifications": True})
    db.commit()
    notify(db, tenant_id, "AUDIT", "Audit Y failed", "boom", severity="ERROR")
    notify(db, tenant_id, "AUDIT", "Audit Y completed", "fine", severity="INFO")  # not an alert
    db.rollback()
    assert sent == []  # rolled back: nothing is emailed
    notify(db, tenant_id, "AUDIT", "Audit Z failed", "boom", severity="ERROR")
    db.commit()
    assert [to for to, _ in sent] == ["admin@test.local"] and "Audit Z failed" in sent[0][1]
