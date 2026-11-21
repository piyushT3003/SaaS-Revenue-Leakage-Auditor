"""Money helpers. All monetary arithmetic uses ``Decimal`` — never binary floats."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
HUNDRED = Decimal("100")


def D(value: Any) -> Decimal:
    """Convert to Decimal safely. Floats are converted via ``str`` to avoid binary artefacts."""
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        value = repr(value)
    try:
        return Decimal(str(value).replace(",", "").strip())
    except InvalidOperation as exc:
        raise ValueError(f"Not a valid decimal amount: {value!r}") from exc


def money(value: Any) -> Decimal:
    """Round to 2 dp using ROUND_HALF_UP (commercial rounding)."""
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def rate(value: Any, places: int = 4) -> Decimal:
    return D(value).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def pct(numerator: Any, denominator: Any) -> Decimal | None:
    """Percentage to 2 dp, or ``None`` when the denominator is zero (undefined, not 0%)."""
    den = D(denominator)
    if den == 0:
        return None
    return (D(numerator) / den * HUNDRED).quantize(CENT, rounding=ROUND_HALF_UP)


def to_json(value: Decimal | None) -> str | None:
    """Serialise money as a string so no precision is lost in transit."""
    return None if value is None else format(value, "f")
