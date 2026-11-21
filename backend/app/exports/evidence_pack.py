"""Automated Audit Evidence Pack (PDF + XLSX) for one or more exceptions.

Contents per exception: audit IDs, customer, contract & pricing versions, usage evidence,
expected-charge calculation, invoice comparison, payment allocations, exception details,
investigation notes, status history, corrections (from the audit log) and the obligation's
status across every audit run (historical comparison)."""
from __future__ import annotations

import hashlib
import io
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.exports.safe import safe_row
from backend.app.models import (
    AuditLog,
    AuditRun,
    Customer,
    EvidencePack,
    ExceptionCase,
    ExceptionEvidence,
    ExceptionStatusHistory,
    InvestigationNote,
    ReconciliationResult,
    User,
)

NAVY = colors.HexColor("#0B1B3A")


def collect(db: Session, tenant_id: int, exception_ids: list[int]) -> list[dict]:
    names = dict(db.execute(select(User.id, User.full_name).where(User.tenant_id == tenant_id)).all())
    out = []
    for e in db.scalars(select(ExceptionCase).where(ExceptionCase.tenant_id == tenant_id, ExceptionCase.id.in_(exception_ids))
                        .order_by(ExceptionCase.id)):
        cust = db.get(Customer, e.customer_id) if e.customer_id else None
        history = []
        if e.obligation_id:
            for r, run in db.execute(select(ReconciliationResult, AuditRun).join(AuditRun).where(
                    ReconciliationResult.obligation_id == e.obligation_id).order_by(AuditRun.created_at)):
                history.append({"run": run.run_code, "type": run.run_type, "completed": run.completed_at, "status": r.status,
                                "expected": r.expected_amount, "invoiced": r.invoiced_amount, "variance": r.variance})
        corrections = []
        if cust:
            for log in db.scalars(select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.action.in_(
                    ("INVOICE_CORRECTED", "ADJUSTMENT_APPROVED", "PAYMENT_ALLOCATED", "DRAFT_INVOICE_CREATED")))):
                corrections.append({"at": log.occurred_at, "action": log.action, "by": names.get(log.user_id), "details": log.details})
        out.append({
            "e": e, "customer": cust,
            "first_run": db.get(AuditRun, e.audit_run_id), "last_run": db.get(AuditRun, e.last_seen_audit_run_id) if e.last_seen_audit_run_id else None,
            "evidence": list(db.scalars(select(ExceptionEvidence).where(ExceptionEvidence.exception_id == e.id).order_by(ExceptionEvidence.id))),
            "notes": [(names.get(n.author_id), n.created_at, n.body) for n in db.scalars(select(InvestigationNote).where(InvestigationNote.exception_id == e.id))],
            "status_history": [(h.from_status, h.to_status, names.get(h.changed_by, "system"), h.changed_at, h.reason)
                               for h in db.scalars(select(ExceptionStatusHistory).where(ExceptionStatusHistory.exception_id == e.id).order_by(ExceptionStatusHistory.id))],
            "audit_history": history,
            "corrections": [c for c in corrections if cust and (str(cust.id) in str(c["details"]) or cust.customer_code in str(c["details"]))][:20],
        })
    return out


def _tbl(data, widths=None):
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("FONTSIZE", (0, 0), (-1, -1), 7.5), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.grey)]))
    return t


def pdf(items: list[dict], generated_by: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, title="Audit Evidence Pack")
    st = getSampleStyleSheet()
    P = lambda t: Paragraph(str(t), st["BodyText"])  # noqa: E731
    story = [Paragraph("<b>Audit Evidence Pack</b>", st["Title"]),
             Paragraph(f"Generated {datetime.now():%Y-%m-%d %H:%M} by {generated_by} · {len(items)} exception(s)", st["Normal"]),
             Paragraph("Every figure below is copied from stored audit results and source records; nothing is recalculated for this report.", st["Italic"]),
             Spacer(1, 4 * mm)]
    for i, it in enumerate(items):
        e, c = it["e"], it["customer"]
        if i:
            story.append(PageBreak())
        story += [Paragraph(f"<b>{e.exception_code}</b> — {e.title}", st["Heading2"]),
                  _tbl([["Field", "Value"], ["Customer", P(f"{c.name} ({c.customer_code})" if c else "—")], ["Category", e.category],
                        ["Billing period", f"{e.period_start} – {e.period_end}"], ["Financial impact", f"Rs. {e.financial_impact:,.2f}"],
                        ["Counts toward leakage", "Yes" if e.counts_toward_leakage else "No"], ["Severity / status", f"{e.severity} / {e.status}"],
                        ["Detected in audit", f"{it['first_run'].run_code} ({it['first_run'].id})"],
                        ["Last seen in audit", it["last_run"].run_code if it["last_run"] else "—"], ["Explanation", P(e.explanation)],
                        ["Resolution", P(e.resolution_reason or "—")]], [45 * mm, 135 * mm]),
                  Spacer(1, 3 * mm), Paragraph("<b>Source evidence</b>", st["Heading4"]),
                  _tbl([["Type", "Record", "Summary"]] + [[ev.evidence_type.replace("_", " "), f"{ev.record_table} #{ev.record_id}", P(ev.summary)]
                                                         for ev in it["evidence"]], [32 * mm, 45 * mm, 103 * mm])]
        if it["audit_history"]:
            story += [Spacer(1, 3 * mm), Paragraph("<b>Historical audit comparison</b>", st["Heading4"]),
                      _tbl([["Audit", "Type", "Status", "Expected", "Invoiced", "Variance"]] +
                           [[h["run"], h["type"], h["status"], f"{h['expected']:,.2f}", f"{h['invoiced']:,.2f}", f"{h['variance']:,.2f}"]
                            for h in it["audit_history"]])]
        story += [Spacer(1, 3 * mm), Paragraph("<b>Investigation notes</b>", st["Heading4"])]
        story += [Paragraph(f"{a} · {t:%Y-%m-%d %H:%M}: {b}", st["BodyText"]) for a, t, b in it["notes"]] or [Paragraph("None", st["BodyText"])]
        story += [Spacer(1, 3 * mm), Paragraph("<b>Status history</b>", st["Heading4"]),
                  _tbl([["From", "To", "By", "At", "Reason"]] + [[f or "—", t, b, f"{at:%Y-%m-%d %H:%M}", P(r)] for f, t, b, at, r in it["status_history"]])]
        if it["corrections"]:
            story += [Spacer(1, 3 * mm), Paragraph("<b>Related corrections</b>", st["Heading4"]),
                      _tbl([["When", "Action", "By", "Details"]] + [[f"{x['at']:%Y-%m-%d}", x["action"], x["by"] or "system", P(str(x["details"])[:300])]
                                                                    for x in it["corrections"]])]
    story += [Spacer(1, 5 * mm), Paragraph("Demonstration data is synthetic.", st["Italic"])]
    doc.build(story)
    return buf.getvalue()


def xlsx(items: list[dict]) -> bytes:
    wb = Workbook()
    head, fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="0B1B3A")

    def sheet(ws, header, rows):
        ws.append(safe_row(header))
        for cell in ws[1]:
            cell.font, cell.fill = head, fill
        for r in rows:
            ws.append(safe_row([str(v) if v is not None and not isinstance(v, (int, float)) else v for v in r]))
        ws.freeze_panes = "A2"

    ws = wb.active
    ws.title = "Exceptions"
    sheet(ws, ["Exception", "Customer", "Category", "Period start", "Impact", "Leakage", "Severity", "Status", "Detected in", "Title", "Explanation"],
          [[i["e"].exception_code, i["customer"].name if i["customer"] else "", i["e"].category, i["e"].period_start, float(i["e"].financial_impact),
            i["e"].counts_toward_leakage, i["e"].severity, i["e"].status, i["first_run"].run_code, i["e"].title, i["e"].explanation] for i in items])
    sheet(wb.create_sheet("Evidence"), ["Exception", "Type", "Table", "Record", "Summary"],
          [[i["e"].exception_code, ev.evidence_type, ev.record_table, ev.record_id, ev.summary] for i in items for ev in i["evidence"]])
    sheet(wb.create_sheet("Audit history"), ["Exception", "Audit", "Type", "Status", "Expected", "Invoiced", "Variance"],
          [[i["e"].exception_code, h["run"], h["type"], h["status"], float(h["expected"]), float(h["invoiced"]), float(h["variance"])] for i in items for h in i["audit_history"]])
    sheet(wb.create_sheet("Notes & history"), ["Exception", "Kind", "By", "At", "Text"],
          [[i["e"].exception_code, "note", a, t, b] for i in items for a, t, b in i["notes"]] +
          [[i["e"].exception_code, f"{f}→{to}", by, at, r] for i in items for f, to, by, at, r in i["status_history"]])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def generate(db: Session, tenant_id: int, user_id: int, user_name: str, exception_ids: list[int], fmt: str) -> EvidencePack:
    items = collect(db, tenant_id, exception_ids)
    if not items:
        raise LookupError("No exceptions found")
    content = pdf(items, user_name) if fmt == "pdf" else xlsx(items)
    codes = "_".join(i["e"].exception_code for i in items[:3]) + ("_etc" if len(items) > 3 else "")
    pack = EvidencePack(tenant_id=tenant_id, exception_id=items[0]["e"].id if len(items) == 1 else None,
                        audit_run_id=items[0]["e"].last_seen_audit_run_id, file_format=fmt, file_name=f"evidence_pack_{codes}.{fmt}",
                        sha256=hashlib.sha256(content).hexdigest(), content=content, generated_by=user_id)
    db.add(pack)
    db.flush()
    return pack
