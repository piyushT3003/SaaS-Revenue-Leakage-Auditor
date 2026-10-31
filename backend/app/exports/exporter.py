import io
import csv
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

class ExportService:
    """
    Production-grade export generator generating downloadable CSV, Excel (XLSX),
    and PDF reports for Executive Summaries, Invoices, and Exception Investigations.
    """

    @staticmethod
    def generate_csv(headers: List[str], rows: List[List[Any]]) -> io.StringIO:
        """Generates real downloadable CSV data."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)
        output.seek(0)
        return output

    @staticmethod
    def generate_xlsx(sheet_name: str, headers: List[str], rows: List[List[Any]], title: str = "SaaS Revenue Assurance Report") -> io.BytesIO:
        """Generates styled Excel workbook with headers, auto-adjusted columns, and formatting."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = sheet_name

        # Title styling
        ws.merge_cells("A1:G1")
        title_cell = ws["A1"]
        title_cell.value = f"SaaS Revenue Assurance Enterprise — {title}"
        title_cell.font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
        title_cell.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 30

        # Subtitle with timestamp
        ws.merge_cells("A2:G2")
        sub_cell = ws["A2"]
        sub_cell.value = f"Generated at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')} | Data Scope: Synthetic Demonstration Dataset"
        sub_cell.font = Font(name="Calibri", size=9, italic=True, color="64748B")
        sub_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[2].height = 18

        # Headers
        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="00F0FF")
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=4, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[4].height = 24

        # Data rows
        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )
        for row_idx, row in enumerate(rows, 5):
            for col_idx, val in enumerate(row, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=val)
                cell.font = Font(name="Calibri", size=10)
                cell.border = thin_border
                if isinstance(val, (int, float, Decimal)):
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.alignment = Alignment(horizontal="left")

        # Auto-fit column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    @staticmethod
    def generate_invoice_pdf(invoice_data: Dict[str, Any]) -> io.BytesIO:
        """
        Generates a professional corporate PDF invoice matching SaaS standards.
        """
        output = io.BytesIO()
        doc = SimpleDocTemplate(
            output,
            pagesize=A4,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'InvoiceTitle',
            parent=styles['Heading1'],
            fontSize=22,
            leading=26,
            textColor=colors.HexColor('#0F172A'),
            fontName='Helvetica-Bold'
        )
        meta_label = ParagraphStyle('MetaLabel', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#64748B'))
        meta_val = ParagraphStyle('MetaVal', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#0F172A'), fontName='Helvetica-Bold')

        elements = []

        # Header Table: Company info & INVOICE label
        header_data = [
            [
                Paragraph("<b>SaaS Revenue Assurance Technologies</b><br/>Prestige Tech Park, Outer Ring Road<br/>Bangalore, KA 560103, India<br/>GSTIN: 29AABCU9603R1Z7", styles['Normal']),
                Paragraph(f"<b>TAX INVOICE</b><br/><font size='10' color='#E11D48'>#{invoice_data.get('invoice_number', 'INV-202610-001')}</font><br/><font size='9' color='#64748B'>Status: {invoice_data.get('status', 'Issued')}</font>", ParagraphStyle('R', parent=styles['Normal'], alignment=2))
            ]
        ]
        t_header = Table(header_data, colWidths=[300, 220])
        t_header.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
        elements.append(t_header)
        elements.append(Spacer(1, 15))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceAfter=15))

        # Bill To & Dates Table
        bill_data = [
            [
                Paragraph("<b>BILL TO:</b>", meta_label),
                Paragraph("<b>INVOICE DETAILS:</b>", meta_label)
            ],
            [
                Paragraph(f"<b>{invoice_data.get('customer_name', 'Customer')}</b><br/>{invoice_data.get('customer_email', 'billing@customer.com')}<br/>Currency: INR (₹)", styles['Normal']),
                Paragraph(
                    f"Issue Date: <b>{invoice_data.get('issue_date', '2026-10-01')}</b><br/>"
                    f"Due Date: <b>{invoice_data.get('due_date', '2026-10-31')}</b><br/>"
                    f"Billing Period: <b>{invoice_data.get('billing_period', '2026-10-01 to 2026-10-31')}</b>",
                    styles['Normal']
                )
            ]
        ]
        t_bill = Table(bill_data, colWidths=[300, 220])
        t_bill.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
        elements.append(t_bill)
        elements.append(Spacer(1, 20))

        # Invoice Line Items Table
        line_items = [["Item Description", "Qty", "Unit Price (₹)", "Discount", "Amount (₹)"]]
        lines = invoice_data.get('lines', [])
        if not lines:
            lines = [{
                "description": "Enterprise Core Platform - Monthly Subscription",
                "quantity": 1,
                "unit_price": invoice_data.get('subtotal', 150000.0),
                "discount_pct": 0,
                "line_total": invoice_data.get('subtotal', 150000.0)
            }]

        for l in lines:
            line_items.append([
                Paragraph(str(l.get('description', '')), styles['Normal']),
                str(l.get('quantity', 1)),
                f"₹{float(l.get('unit_price', 0)):,.2f}",
                f"{float(l.get('discount_pct', 0))}%",
                f"₹{float(l.get('line_total', 0)):,.2f}"
            ])

        t_lines = Table(line_items, colWidths=[240, 40, 80, 60, 100])
        t_lines.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')])
        ]))
        elements.append(t_lines)
        elements.append(Spacer(1, 15))

        # Summary Table
        subtotal = float(invoice_data.get('subtotal', 150000.0))
        tax = float(invoice_data.get('tax_amount', subtotal * 0.18))
        total = float(invoice_data.get('total_amount', subtotal + tax))
        paid = float(invoice_data.get('paid_amount', 0.0))
        balance = float(invoice_data.get('balance_due', total - paid))

        summary_data = [
            ["", "Subtotal:", f"₹{subtotal:,.2f}"],
            ["", "GST (18%):", f"₹{tax:,.2f}"],
            ["", "Total Amount:", f"₹{total:,.2f}"],
            ["", "Amount Paid:", f"₹{paid:,.2f}"],
            ["", "Balance Due:", f"₹{balance:,.2f}"]
        ]
        t_summary = Table(summary_data, colWidths=[280, 120, 120])
        t_summary.setStyle(TableStyle([
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (1, 2), (-1, 2), 'Helvetica-Bold'),
            ('FONTNAME', (1, 4), (-1, 4), 'Helvetica-Bold'),
            ('TEXTCOLOR', (1, 4), (-1, 4), colors.HexColor('#E11D48')),
            ('LINEABOVE', (1, 2), (-1, 2), 1, colors.HexColor('#0F172A')),
            ('LINEABOVE', (1, 4), (-1, 4), 1.5, colors.HexColor('#E11D48')),
        ]))
        elements.append(t_summary)
        elements.append(Spacer(1, 30))

        # Remittance Note
        elements.append(Paragraph(
            "<font size='8' color='#64748B'><b>PAYMENT INSTRUCTIONS:</b> Please remit via NEFT/RTGS to HDFC Bank A/C: 50200012345678, IFSC: HDFC0000123. Quote invoice number on all remittances. Note: Generated from synthetic demonstration dataset.</font>",
            styles['Normal']
        ))

        doc.build(elements)
        output.seek(0)
        return output

    @staticmethod
    def generate_executive_report_pdf(overview_data: Dict[str, Any]) -> io.BytesIO:
        """
        Generates an Executive Revenue Assurance Audit PDF Report with KPI summaries.
        """
        output = io.BytesIO()
        doc = SimpleDocTemplate(
            output,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        styles = getSampleStyleSheet()
        elements = []

        # Title
        elements.append(Paragraph("<b>SaaS Revenue Assurance — Executive Audit Report</b>", styles['Heading1']))
        elements.append(Paragraph(f"Reporting Scope: {overview_data.get('period', 'October 2026')} | Status: Reconciled", styles['Normal']))
        elements.append(Spacer(1, 15))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceAfter=15))

        # KPI Cards Summary Table
        kpi_table_data = [
            ["Total Revenue (MRR)", "Revenue Leakage", "Outstanding Payments", "Active Customers", "Contribution Margin", "Reconciliation Health"],
            [
                overview_data.get('mrr', '₹1,24,80,000'),
                overview_data.get('leakage', '₹8,76,000'),
                overview_data.get('outstanding', '₹13,20,000'),
                overview_data.get('customers', '218'),
                overview_data.get('margin', '32.6%'),
                overview_data.get('health', '92.4%')
            ]
        ]
        t_kpis = Table(kpi_table_data, colWidths=[90, 90, 90, 90, 90, 90])
        t_kpis.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('FONTSIZE', (0, 1), (-1, 1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('BACKGROUND', (1, 1), (1, 1), colors.HexColor('#FFE4E6')),  # Leakage red
            ('TEXTCOLOR', (1, 1), (1, 1), colors.HexColor('#E11D48')),
        ]))
        elements.append(t_kpis)
        elements.append(Spacer(1, 20))

        # Section: High-Impact Discrepancies
        elements.append(Paragraph("<b>Key Detected Revenue Discrepancies</b>", styles['Heading2']))
        elements.append(Spacer(1, 8))

        exc_rows = [["Exception ID", "Customer", "Issue Type", "Impact", "Status", "Resolution Summary"]]
        for e in overview_data.get('recent_exceptions', []):
            exc_rows.append([
                e.get('exception_code', ''),
                e.get('customer_name', ''),
                e.get('issue_type', ''),
                f"₹{float(e.get('financial_impact', 0)):,.2f}",
                e.get('status', ''),
                Paragraph(e.get('description', ''), styles['Normal'])
            ])

        t_exc = Table(exc_rows, colWidths=[70, 110, 80, 70, 60, 150])
        t_exc.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP')
        ]))
        elements.append(t_exc)

        doc.build(elements)
        output.seek(0)
        return output
