"""Executive report export (PDF and XLSX) built only from the central metric service and stored results."""
from __future__ import annotations

import io
from datetime import date, datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.analytics import metrics as M
from backend.app.models import Customer, ExceptionCase, Tenant
from backend.app.exports.safe import safe_row

NAVY = colors.HexColor("#0B1B3A")


def collect(db: Session, tenant_id: int, start: date, end: date, as_of: date) -> dict:
    run = M.latest_audit(db, tenant_id, start, end)
    contrib, rows = M.contribution(db, tenant_id, start, end)
    kpis = [M.mrr(db, tenant_id, end), M.leakage(db, tenant_id, run), M.outstanding(db, tenant_id, as_of),
            M.active_customers(db, tenant_id, end), contrib, M.collection_rate(db, tenant_id, start, end, as_of)]
    cust = dict(db.execute(select(Customer.id, Customer.name).where(Customer.tenant_id == tenant_id)).all())
    exc = db.scalars(select(ExceptionCase).where(ExceptionCase.tenant_id == tenant_id, ExceptionCase.period_start >= start,
                                                 ExceptionCase.period_start <= end).order_by(ExceptionCase.financial_impact.desc())).all()
    return {"tenant": db.get(Tenant, tenant_id).name, "start": start, "end": end, "as_of": as_of, "run": run, "kpis": kpis,
            "exceptions": [(e, cust.get(e.customer_id, "—")) for e in exc],
            "customers": sorted(rows, key=lambda r: r["contribution"])[:15], "names": cust}


def _fmt(m) -> str:
    if m.value is None:
        return "n/a"
    if m.unit == "CURRENCY":
        return f"Rs. {m.value:,.2f}"
    if m.unit == "PERCENT":
        return f"{m.value}%"
    return f"{m.value:,}"


def executive_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm,
                            title="Executive Revenue Assurance Report")
    st = getSampleStyleSheet()
    run = data["run"]
    story = [Paragraph(f"<b>Executive Revenue Assurance Report</b> — {data['tenant']}", st["Title"]),
             Paragraph(f"Period {data['start']} to {data['end']} · balances as of {data['as_of']} · "
                       f"audit {run.run_code + ' (' + run.status + ')' if run else 'none for this period'} · generated {datetime.now():%Y-%m-%d %H:%M}",
                       st["Normal"]), Spacer(1, 5 * mm)]
    kt = [["Metric", "Value", "Formula", "Basis"]] + [[k.label, _fmt(k), Paragraph(k.formula, st["BodyText"]),
                                                       Paragraph(k.basis, st["BodyText"])] for k in data["kpis"]]
    t = Table(kt, colWidths=[38 * mm, 32 * mm, 90 * mm, 105 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("FONTSIZE", (0, 0), (-1, -1), 8), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.grey)]))
    story += [t, Spacer(1, 6 * mm), Paragraph("<b>Exceptions in period (by financial impact)</b>", st["Heading3"])]
    et = [["ID", "Customer", "Category", "Description", "Impact", "Severity", "Status"]]
    for e, cname in data["exceptions"][:40]:
        et.append([e.exception_code, Paragraph(cname, st["BodyText"]), e.category.replace("_", " ").title(),
                   Paragraph(e.title, st["BodyText"]), f"Rs. {e.financial_impact:,.2f}", e.severity, e.status])
    t2 = Table(et, colWidths=[18 * mm, 45 * mm, 35 * mm, 100 * mm, 30 * mm, 18 * mm, 22 * mm], repeatRows=1)
    t2.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTSIZE", (0, 0), (-1, -1), 7.5), ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                            ("ALIGN", (4, 1), (4, -1), "RIGHT")]))
    story += [t2, PageBreak(), Paragraph("<b>Lowest-contribution customers</b>", st["Heading3"])]
    ct = [["Customer", "Net revenue", "Direct cost", "Contribution", "Margin", "Segment"]]
    for r in data["customers"]:
        ct.append([data["names"].get(r["customer_id"], "?"), f"Rs. {r['net_revenue']:,.2f}", f"Rs. {r['direct_cost']:,.2f}",
                   f"Rs. {r['contribution']:,.2f}", f"{r['margin_pct']}%" if r["margin_pct"] is not None else "n/a", r["segment"]])
    t3 = Table(ct, repeatRows=1)
    t3.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.25, colors.grey)]))
    story += [t3, Spacer(1, 5 * mm), Paragraph("Contribution is customer-level contribution, not accounting profit. "
                                               "Demonstration data is synthetic and does not represent real savings.", st["Italic"])]
    doc.build(story)
    return buf.getvalue()


def executive_xlsx(data: dict) -> bytes:
    wb = Workbook()
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="0B1B3A")

    def sheet(ws, header, rows, widths):
        ws.append(safe_row(header))
        for c in ws[1]:
            c.font, c.fill, c.alignment = head, fill, Alignment(vertical="center")
        for r in rows:
            ws.append(safe_row(r))
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[chr(64 + i)].width = w
        ws.freeze_panes = "A2"

    ws = wb.active
    ws.title = "KPIs"
    sheet(ws, ["Metric", "Value", "Unit", "Formula", "Period", "As of", "Basis"],
          [[k.label, float(k.value) if k.value is not None else None, k.unit, k.formula, k.period, k.as_of, k.basis] for k in data["kpis"]],
          [26, 18, 10, 60, 24, 12, 80])
    sheet(wb.create_sheet("Exceptions"), ["ID", "Customer", "Category", "Description", "Impact", "Counts toward leakage", "Severity", "Status", "Period start"],
          [[e.exception_code, c, e.category, e.title, float(e.financial_impact), e.counts_toward_leakage, e.severity, e.status,
            e.period_start] for e, c in data["exceptions"]], [10, 32, 22, 60, 14, 12, 10, 12, 12])
    sheet(wb.create_sheet("Customer contribution"), ["Customer", "Net revenue", "Direct cost", "Contribution", "Margin %", "Segment"],
          [[data["names"].get(r["customer_id"]), float(r["net_revenue"]), float(r["direct_cost"]), float(r["contribution"]),
            float(r["margin_pct"]) if r["margin_pct"] is not None else None, r["segment"]] for r in data["customers"]],
          [32, 16, 16, 16, 10, 14])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
