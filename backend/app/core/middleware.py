import time
import uuid
import json
import logging
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from backend.app.core.config import settings

# Structured Logger setup
logger = logging.getLogger("saas_assurance")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('{"time":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","message":%(message)s}'))
if not logger.handlers:
    logger.addHandler(handler)

class RateLimiter:
    """In-memory sliding window rate limiter."""
    def __init__(self):
        # Maps (ip, route_prefix) -> list of timestamps
        self.requests: Dict[Tuple[str, str], list] = defaultdict(list)

    def is_allowed(self, ip: str, path: str) -> Tuple[bool, int]:
        now = time.time()
        window = 60.0  # 1 minute

        if "/auth/login" in path:
            limit = settings.RATE_LIMIT_AUTH_PER_MINUTE
            key = (ip, "auth")
        elif "/ai/query" in path or "/reconciliation/run" in path:
            limit = settings.RATE_LIMIT_AI_PER_MINUTE
            key = (ip, "heavy")
        else:
            limit = settings.RATE_LIMIT_GLOBAL_PER_MINUTE
            key = (ip, "general")

        # Clean timestamps older than 1 minute
        self.requests[key] = [t for t in self.requests[key] if now - t < window]

        if len(self.requests[key]) >= limit:
            retry_after = int(window - (now - self.requests[key][0]))
            return False, max(1, retry_after)

        self.requests[key].append(now)
        return True, 0

limiter = RateLimiter()

class StructuredLoggingAndRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Rate limiting check (exempting static files and health checks)
        if not path.startswith(("/static", "/docs", "/redoc", "/openapi.json", "/api/health")):
            allowed, retry_after = limiter.is_allowed(client_ip, path)
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    headers={"Retry-After": str(retry_after), "X-Request-ID": request_id},
                    content={
                        "error": {
                            "code": "RATE_LIMIT_EXCEEDED",
                            "message": f"Rate limit exceeded. Please retry in {retry_after} seconds.",
                            "request_id": request_id
                        }
                    }
                )

        start_time = time.time()
        try:
            response: Response = await call_next(request)
            duration_ms = round((time.time() - start_time) * 1000, 2)
            response.headers["X-Request-ID"] = request_id

            # Log API access
            log_payload = {
                "request_id": request_id,
                "client_ip": client_ip,
                "method": request.method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": duration_ms
            }
            logger.info(json.dumps(log_payload))
            return response

        except Exception as exc:
            duration_ms = round((time.time() - start_time) * 1000, 2)
            log_payload = {
                "request_id": request_id,
                "client_ip": client_ip,
                "method": request.method,
                "path": path,
                "error": str(exc),
                "duration_ms": duration_ms
            }
            logger.error(json.dumps(log_payload))

            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                headers={"X-Request-ID": request_id},
                content={
                    "error": {
                        "code": "INTERNAL_SERVER_ERROR",
                        "message": "An unexpected server error occurred. Please contact engineering with your Request ID.",
                        "request_id": request_id
                    }
                }
            )
