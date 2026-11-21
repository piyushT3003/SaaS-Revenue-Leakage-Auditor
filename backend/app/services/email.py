"""Outgoing email for account messages (password reset). Optional: when no provider is configured,
`email_enabled()` is False and the UI offers admin-issued reset links instead. Never raises to the caller's
user-facing flow — a delivery failure is logged, so "forgot password" cannot be used to probe accounts."""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

import httpx

from backend.app.core.config import settings
from backend.app.core.logging import log


def email_enabled() -> bool:
    if not settings.EMAIL_FROM:
        return False
    if settings.EMAIL_PROVIDER == "smtp":
        return bool(settings.SMTP_HOST)
    if settings.EMAIL_PROVIDER == "brevo":
        return bool(settings.BREVO_API_KEY)
    return False


def send_email(to: str, subject: str, text: str) -> bool:
    if not email_enabled():
        log.warning("email not configured; message not sent", extra={"subject": subject})
        return False
    try:
        if settings.EMAIL_PROVIDER == "brevo":
            r = httpx.post("https://api.brevo.com/v3/smtp/email", timeout=10,
                           headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
                           json={"sender": {"email": settings.EMAIL_FROM, "name": settings.PROJECT_NAME},
                                 "to": [{"email": to}], "subject": subject, "textContent": text})
            r.raise_for_status()
        else:
            msg = EmailMessage()
            msg["From"], msg["To"], msg["Subject"] = settings.EMAIL_FROM, to, subject
            msg.set_content(text)
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as s:
                s.starttls(context=ssl.create_default_context())
                if settings.SMTP_USERNAME:
                    s.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                s.send_message(msg)
        return True
    except Exception:  # noqa: BLE001 — logged, never surfaced (see module docstring)
        log.exception("email delivery failed", extra={"subject": subject})
        return False
