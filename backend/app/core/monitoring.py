"""Optional error monitoring with Sentry (free Developer plan). Off unless SENTRY_DSN is set.

Privacy: no default PII, request bodies/cookies/authorization headers are stripped before sending, and
performance tracing is off unless SENTRY_TRACES_SAMPLE_RATE > 0."""
from __future__ import annotations

from urllib.parse import urlparse

from backend.app.core.config import settings

SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-forwarded-for"}


def _scrub(event: dict, _hint: dict) -> dict:
    req = event.get("request") or {}
    req.pop("cookies", None)
    req.pop("data", None)
    headers = req.get("headers")
    if isinstance(headers, dict):
        req["headers"] = {k: ("[filtered]" if k.lower() in SENSITIVE_HEADERS else v) for k, v in headers.items()}
    event.pop("user", None)
    return event


def init_monitoring() -> bool:
    if not settings.SENTRY_DSN:
        return False
    import sentry_sdk

    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENVIRONMENT, send_default_pii=False,
                    traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE, before_send=_scrub,
                    release=settings.APP_VERSION)
    return True


def frontend_dsn_parts() -> tuple[str, str] | None:
    """(host, project_id) of the browser DSN, used to validate the tunnel's forwarding target."""
    if not settings.SENTRY_FRONTEND_DSN:
        return None
    u = urlparse(settings.SENTRY_FRONTEND_DSN)
    return (u.hostname or "", u.path.strip("/"))
