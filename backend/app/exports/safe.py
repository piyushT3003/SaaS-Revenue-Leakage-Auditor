"""Spreadsheet formula-injection guard (CWE-1236).

Customer names, descriptions and notes come from imported files. A value such as ``=HYPERLINK(...)`` or
``+cmd|...`` would be evaluated by Excel when an exported workbook is opened. Every text cell written to an
export goes through :func:`safe_row`, which prefixes risky text with an apostrophe so it is shown literally.
Numbers, dates and Decimals are left untouched, so figures stay numeric.
"""
from __future__ import annotations

from typing import Any, Iterable

RISKY = ("=", "+", "-", "@", "\t", "\r", "\n")


def safe_cell(v: Any) -> Any:
    if isinstance(v, str) and v.startswith(RISKY):
        # A negative number written as text (e.g. "-1500.00") is a value, not a formula; keep it readable.
        try:
            float(v.replace(",", ""))
            return v
        except ValueError:
            return "'" + v
    return v


def safe_row(row: Iterable[Any]) -> list[Any]:
    return [safe_cell(v) for v in row]
