"""Optional Sentry monitoring: off by default, PII scrubbed, browser tunnel only forwards to the configured project."""
import json

from backend.app.core.config import settings
from backend.app.core.monitoring import _scrub


def test_tunnel_is_off_without_a_browser_dsn(client):
    assert client.post("/api/v1/monitoring/sentry-tunnel", content=b"{}\n").status_code == 404
    assert client.get("/api/v1/auth/options").json()["sentry"] is None


def test_tunnel_rejects_other_projects_and_bad_envelopes(client, monkeypatch):
    monkeypatch.setattr(settings, "SENTRY_FRONTEND_DSN", "https://publickey@o1.ingest.sentry.io/12345")
    other = json.dumps({"dsn": "https://k@evil.example/999"}).encode() + b"\n{}\n"
    assert client.post("/api/v1/monitoring/sentry-tunnel", content=other).status_code == 403
    assert client.post("/api/v1/monitoring/sentry-tunnel", content=b"not json\n").status_code == 400
    assert client.post("/api/v1/monitoring/sentry-tunnel", content=b"x" * 1_000_001).status_code == 413
    assert client.get("/api/v1/auth/options").json()["sentry"]["dsn"].endswith("/12345")


def test_events_are_scrubbed_of_credentials_and_personal_data():
    event = {"user": {"email": "a@b.c"}, "request": {"cookies": {"sra_token": "x"}, "data": {"password": "p"},
                                                      "headers": {"Authorization": "Bearer t", "Accept": "json"}}}
    out = _scrub(event, {})
    assert "user" not in out and "cookies" not in out["request"] and "data" not in out["request"]
    assert out["request"]["headers"] == {"Authorization": "[filtered]", "Accept": "json"}
