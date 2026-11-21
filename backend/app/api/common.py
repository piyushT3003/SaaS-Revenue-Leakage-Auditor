"""Shared API helpers: lossless JSON (money as strings), pagination, errors."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, Query, status


def J(obj: Any) -> Any:
    """Convert to JSON-safe values without losing precision: Decimal → string, dates → ISO."""
    if isinstance(obj, Decimal):
        return format(obj, "f")
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: J(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [J(v) for v in obj]
    return obj


def row(model_obj, *fields: str, **extra) -> dict:
    return J({**{f: getattr(model_obj, f) for f in fields}, **extra})


@dataclass
class Page:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def wrap(self, items: list, total: int) -> dict:
        return {"items": items, "page": self.page, "page_size": self.page_size, "total": total,
                "pages": max(1, -(-total // self.page_size))}


def pagination(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)) -> Page:
    return Page(page, page_size)


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def parse_ids(csv_ids: str | None) -> list[int] | None:
    if not csv_ids:
        return None
    try:
        return sorted({int(x) for x in csv_ids.split(",") if x.strip()})
    except ValueError as exc:
        raise HTTPException(422, "ids must be a comma-separated list of integers") from exc
