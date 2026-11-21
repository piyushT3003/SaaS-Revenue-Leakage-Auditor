"""Same-origin tunnel for browser error reports, so the SPA's CSP needs no third-party origin and ad blockers
do not drop reports. Only forwards to the configured Sentry project; anything else is rejected."""
from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

from backend.app.core.monitoring import frontend_dsn_parts

router = APIRouter()
MAX_ENVELOPE = 1_000_000


@router.post("/monitoring/sentry-tunnel", include_in_schema=False)
async def sentry_tunnel(request: Request):
    target = frontend_dsn_parts()
    if target is None:
        raise HTTPException(404, "Not Found")
    body = await request.body()
    if len(body) > MAX_ENVELOPE:
        raise HTTPException(413, "Envelope too large")
    try:
        header = json.loads(body.split(b"\n", 1)[0])
        dsn = httpx.URL(header["dsn"])
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Invalid envelope") from None
    host, project = target
    if dsn.host != host or dsn.path.strip("/") != project:
        raise HTTPException(403, "Unexpected DSN")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(f"https://{host}/api/{project}/envelope/", content=body,
                              headers={"Content-Type": "application/x-sentry-envelope"})
    return Response(status_code=r.status_code)
