"""Deterministic synthetic DEMONSTRATION dataset with known (ground-truth) anomalies.

⚠ Everything produced here is synthetic demonstration data. It does not describe any real
company, and results computed from it must never be presented as real savings.

The generator:
1. builds ~200 customers, 5 products, contracts (some with mid-period amendments and a few
   with deliberate coverage gaps), versioned pricing rules, subscriptions, usage batches and
   events and product costs — all imported through the normal validation/lineage pipeline;
2. uses the financial engine to produce *correct* invoices for May–Oct 2026;
3. injects controlled anomalies into invoices, payments and usage deliveries and records each
   one in ``synthetic_ground_truth`` so detection precision/recall can be measured.
"""
from __future__ import annotations

import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.analytics.calculation import add_months, month_end
from backend.app.core.logging import log
from backend.app.core.money import money
from backend.app.ingestion.pipeline import import_records_direct
from backend.app.models import Customer, ImportBatch, Role, SyntheticGroundTruth, Tenant, User
from backend.app.reconciliation.obligations import build_expected_obligations
from backend.app.security.auth import hash_password

SEED = 20261031
WINDOW_START = date(2026, 5, 1)
WINDOW_END = date(2026, 10, 31)
DATA_AS_OF = date(2026, 11, 14)
GST = Decimal("0.18")

FEATURED = ["TechNova Pvt. Ltd.", "CloudCore Solutions", "DataCrest Technologies", "InfiniIT Services",
            "NextGen Systems", "Zentrix Analytics", "BluePeak Software", "Orbitron Labs"]
PREFIX = ["Apex", "Nimbus", "Vertex", "Quanta", "Helix", "Lumen", "Stratus", "Cobalt", "Krypton", "Nova", "Pixel",
          "Sigma", "Tera", "Vector", "Zenith", "Aurora", "Crest", "Delta", "Echo", "Falcon", "Granite", "Horizon",
          "Indigo", "Juniper", "Kestrel", "Lattice", "Mosaic", "Nexus", "Onyx", "Prism", "Quill", "Radiant", "Saffron"]
SUFFIX = ["Systems", "Technologies", "Labs", "Analytics", "Software", "Networks", "Digital", "Solutions", "Cloud",
          "Infotech", "Data", "Logistics", "Health", "Fintech", "Retail", "Media"]
INDUSTRIES = ["Fintech", "Healthcare", "Retail", "Logistics", "Manufacturing", "Media", "EdTech", "SaaS", "Telecom"]
REGIONS = ["Mumbai", "Bengaluru", "Delhi NCR", "Pune", "Hyderabad", "Chennai", "Singapore", "Dubai"]
OWNERS = ["Ananya Rao", "Rohan Mehta", "Kavya Iyer", "Arjun Nair", "Meera Shah"]

PRODUCTS = [
    {"product_code": "P-CORE", "name": "Platform Core", "product_family": "Platform", "charge_model": "RECURRING", "unit_name": "seat"},
    {"product_code": "P-ANLY", "name": "Analytics Add-on", "product_family": "Add-ons", "charge_model": "RECURRING", "unit_name": "workspace"},
    {"product_code": "P-SUPP", "name": "Premium Support", "product_family": "Services", "charge_model": "RECURRING", "unit_name": "plan"},
    {"product_code": "P-API", "name": "API Calls", "product_family": "Usage", "charge_model": "USAGE", "unit_name": "1k calls"},
    {"product_code": "P-STOR", "name": "Data Storage", "product_family": "Usage", "charge_model": "USAGE", "unit_name": "GB"},
]
SEAT_PRICE = {"ENTERPRISE": Decimal("1500"), "MID_MARKET": Decimal("1200"), "SMB": Decimal("900")}
ANLY_PRICE = {"ENTERPRISE": Decimal("12000"), "MID_MARKET": Decimal("6000"), "SMB": Decimal("2500")}
SUPP_PRICE = {"ENTERPRISE": Decimal("15000"), "MID_MARKET": Decimal("8000"), "SMB": Decimal("4000")}
API_TIERS = [{"up_to": "500", "unit_price": "20"}, {"up_to": "2000", "unit_price": "15"}, {"up_to": None, "unit_price": "10"}]


@dataclass
class Truth:
    category: str
    customer_code: str
    reference: str
    period_start: date | None
    impact: Decimal
    description: str


def _iso(d) -> str:
    return d.isoformat() if d else ""


class Generator:
    def __init__(self, db: Session, tenant: Tenant):
        self.db, self.tenant = db, tenant
        self.r = random.Random(SEED)
        self.tz = ZoneInfo(tenant.timezone)
        self.truth: list[Truth] = []

    # ------------------------------------------------------------------ reference data
    def reference(self) -> None:
        r = self.r
        customers, contracts, versions, rules, subs = [], [], [], [], []
        self.cust_meta: dict[str, dict] = {}
        names = list(FEATURED)
        used = set(names)
        while len(names) < 200:
            n = f"{r.choice(PREFIX)} {r.choice(SUFFIX)}"
            if n not in used:
                used.add(n)
                names.append(n + r.choice(["", " Pvt. Ltd.", " Inc.", " LLP"]))
        for i, name in enumerate(names, start=1):
            seg = "ENTERPRISE" if i <= 8 or r.random() < 0.36 else ("MID_MARKET" if r.random() < 0.55 else "SMB")
            code = f"CUST-{i:04d}"
            # 12 customers onboard during October ("new this month"); others earlier
            if 180 < i <= 192:
                start = date(2026, 10, r.randint(1, 20))
            elif i > 160:
                start = date(2026, r.randint(5, 9), r.randint(1, 28))
            else:
                start = date(r.randint(2023, 2025), r.randint(1, 12), 1)
            churn_end = None
            if 150 < i <= 158:  # churned during the window
                churn_end = date(2026, r.randint(6, 9), r.randint(10, 28))
            customers.append({"customer_code": code, "name": name, "segment": seg, "industry": r.choice(INDUSTRIES),
                              "region": r.choice(REGIONS), "status": "CHURNED" if churn_end else "ACTIVE",
                              "onboarded_on": start, "account_owner": r.choice(OWNERS)})
            freq = "MONTHLY"
            ctr = f"CTR-{i:04d}"
            contracts.append({"contract_number": ctr, "customer_code": code, "start_date": start, "end_date": churn_end,
                              "currency": "INR", "billing_frequency": freq, "payment_terms_days": r.choice([15, 30, 30, 45]),
                              "status": "TERMINATED" if churn_end else "ACTIVE"})
            seat_price = SEAT_PRICE[seg]
            seats = Decimal(r.randint(40, 80) if seg == "ENTERPRISE" else r.randint(15, 40) if seg == "MID_MARKET" else r.randint(3, 15))
            discount = Decimal(r.choice([0, 0, 5, 10, 10, 15] if seg != "SMB" else [0, 0, 0, 5]))
            if name == "TechNova Pvt. Ltd.":
                seats, discount = Decimal("200"), Decimal("0")
            if name == "CloudCore Solutions":
                seat_price, seats, discount = Decimal("600"), Decimal("600"), Decimal("0")
            if name == "InfiniIT Services":
                discount = Decimal("10")
            # contract versions: 25 % amended inside the window (often mid-month); 3 customers have a coverage gap
            amend = None
            if 20 < i <= 70 and i % 2 == 0 and start < WINDOW_START:
                amend = date(2026, r.randint(6, 10), r.choice([1, 1, 16]))
            gap = i in (61, 63, 65)
            v1_end = (amend - timedelta(days=1)) if amend else (date(2026, 9, 30) if gap else None)
            versions.append({"contract_number": ctr, "version_number": 1, "effective_from": start, "effective_to": v1_end,
                             "change_reason": "Initial agreement", "signed_on": start - timedelta(days=7)})
            terms = [(1, seat_price, discount)]
            if amend:
                new_price = money(seat_price * Decimal(r.choice(["1.05", "1.08", "1.10", "0.95"])))
                versions.append({"contract_number": ctr, "version_number": 2, "effective_from": amend, "effective_to": None,
                                 "change_reason": "Renewal price amendment", "signed_on": amend - timedelta(days=10)})
                terms.append((2, new_price, discount))
            has_anly = r.random() < 0.6 or name in FEATURED[:4]
            has_supp = seg != "SMB" and r.random() < 0.45 or name in ("NextGen Systems",)
            supp_freq = "QUARTERLY" if has_supp and r.random() < 0.4 else "MONTHLY"
            has_api = r.random() < 0.7 or name == "DataCrest Technologies"
            has_stor = r.random() < 0.5
            for vno, price, disc in terms:
                key = f"{ctr}-V{vno}"
                rules.append({"rule_key": f"{key}-CORE", "contract_number": ctr, "contract_version": vno, "product_code": "P-CORE",
                              "charge_type": "RECURRING", "pricing_model": "PER_UNIT", "unit_price": price, "discount_pct": disc})
                if has_anly:
                    rules.append({"rule_key": f"{key}-ANLY", "contract_number": ctr, "contract_version": vno, "product_code": "P-ANLY",
                                  "charge_type": "RECURRING", "pricing_model": "FLAT", "unit_price": ANLY_PRICE[seg]})
                if has_supp:
                    rules.append({"rule_key": f"{key}-SUPP", "contract_number": ctr, "contract_version": vno, "product_code": "P-SUPP",
                                  "charge_type": "RECURRING", "pricing_model": "FLAT", "unit_price": SUPP_PRICE[seg]})
                if has_api:
                    rules.append({"rule_key": f"{key}-API", "contract_number": ctr, "contract_version": vno, "product_code": "P-API",
                                  "charge_type": "USAGE", "pricing_model": "TIERED_GRADUATED", "unit_price": "0",
                                  "included_units": "100", "tiers": API_TIERS})
                if has_stor:
                    rules.append({"rule_key": f"{key}-STOR", "contract_number": ctr, "contract_version": vno, "product_code": "P-STOR",
                                  "charge_type": "USAGE", "pricing_model": "PER_UNIT", "unit_price": "12", "included_units": "200",
                                  "discount_pct": disc})
            sub_end = churn_end
            def sub(code_suffix, product, qty, freq_="MONTHLY", plan=""):
                subs.append({"subscription_code": f"SUB-{i:04d}-{code_suffix}", "customer_code": code, "contract_number": ctr,
                             "product_code": product, "plan_name": plan, "quantity": qty,
                             "status": "CANCELLED" if sub_end else "ACTIVE", "start_date": start, "end_date": sub_end,
                             "billing_frequency": freq_})
            sub("CORE", "P-CORE", seats, plan=f"{seg.title().replace('_', '-')} Platform")
            if has_anly:
                sub("ANLY", "P-ANLY", 1, plan="Analytics")
            if has_supp:
                sub("SUPP", "P-SUPP", 1, supp_freq, plan="Premium Support")
            if has_api:
                sub("API", "P-API", 1, plan="API metered")
            if has_stor:
                sub("STOR", "P-STOR", 1, plan="Storage metered")
            self.cust_meta[code] = {"name": name, "segment": seg, "start": start, "end": churn_end, "api": has_api,
                                    "stor": has_stor, "supp": has_supp, "anly": has_anly, "index": i}
        imp = lambda key, recs: import_records_direct(self.db, self.tenant.id, key, recs, f"synthetic_{key}.csv")  # noqa: E731
        imp("customers", customers)
        imp("products", PRODUCTS)
        imp("contracts", contracts)
        imp("contract_versions", versions)
        imp("pricing_rules", rules)
        imp("subscriptions", subs)
        self.subs = subs

    # ------------------------------------------------------------------ usage
    def usage(self) -> None:
        r = self.r
        batches, events = [], []
        month = WINDOW_START
        self.batch_counts: dict[str, int] = defaultdict(int)
        while month <= WINDOW_END:
            for meter in ("API", "STOR"):
                batches.append({"batch_code": f"UB-{meter}-{month:%Y%m}", "source_system": f"meter-{meter.lower()}",
                                "period_start": month, "period_end": month_end(month), "sequence_number": month.month,
                                "status": "PROCESSED",
                                "received_at": datetime.combine(month_end(month) + timedelta(days=1), time(2, 0), self.tz)})
            month = add_months(month, 1)
        for s in self.subs:
            if s["product_code"] not in ("P-API", "P-STOR"):
                continue
            meta = self.cust_meta[s["customer_code"]]
            seg = meta["segment"]
            meter = "API" if s["product_code"] == "P-API" else "STOR"
            base = {"ENTERPRISE": 60, "MID_MARKET": 25, "SMB": 8}[seg] if meter == "API" else {"ENTERPRISE": 40, "MID_MARKET": 15, "SMB": 6}[seg]
            if meta["name"] == "DataCrest Technologies" and meter == "API":
                base = 150
            day = max(WINDOW_START, s["start_date"])
            end = min(WINDOW_END, s["end_date"] or WINDOW_END)
            while day <= end:
                qty = Decimal(max(0, int(base * r.uniform(0.6, 1.5))))
                if qty > 0:
                    events.append({"event_id": f"EVT-{s['subscription_code']}-{day:%Y%m%d}", "subscription_code": s["subscription_code"],
                                   "usage_batch_code": f"UB-{meter}-{day:%Y%m}",
                                   "occurred_at": datetime.combine(day, time(r.randint(0, 23), r.randint(0, 59)), self.tz),
                                   "quantity": qty})
                    self.batch_counts[f"UB-{meter}-{day:%Y%m}"] += 1
                day += timedelta(days=2)
        for b in batches:
            b["control_event_count"] = self.batch_counts[b["batch_code"]]
            b["control_quantity"] = None
        # Injected integrity issue: the September storage meter reported 37 more events than were delivered.
        for b in batches:
            if b["batch_code"] == "UB-STOR-202609":
                b["control_event_count"] += 37
                self.truth.append(Truth("USAGE_INTEGRITY", "-", b["batch_code"], date(2026, 9, 1), Decimal("0"),
                                        "Source control total is 37 events higher than ingested events"))
        import_records_direct(self.db, self.tenant.id, "usage_batches", batches, "synthetic_usage_batches.csv")
        import_records_direct(self.db, self.tenant.id, "usage_events", events, "synthetic_usage_events.csv")

    # ------------------------------------------------------------------ invoices
    def invoices(self) -> None:
        r = self.r
        code_by_id = dict(self.db.execute(select(Customer.id, Customer.customer_code).where(Customer.tenant_id == self.tenant.id)).all())
        headers, lines = [], []
        self.invoice_index: list[dict] = []
        n = 0
        month = WINDOW_START
        anomalies = self._anomaly_plan()
        while month <= WINDOW_END:
            m_end = month_end(month)
            build = build_expected_obligations(self.db, self.tenant.id, month, m_end)
            by_cust: dict[int, list] = defaultdict(list)
            for ob in build.obligations:
                if ob.calc is None:  # excluded (e.g. version gap) — still billed by the billing system
                    continue
                by_cust[ob.customer_id].append(ob)
            for cid in sorted(by_cust):
                code = code_by_id[cid]
                n += 1
                inv_no = f"INV-{month:%y%m}-{n:05d}"
                inv_lines = []
                for ln_no, ob in enumerate(sorted(by_cust[cid], key=lambda o: (o.charge_type, o.subscription_code)), start=1):
                    line = self._line(ob, inv_no, ln_no)
                    if line is None:
                        continue
                    inv_lines.append((ob, line))
                inv_lines = self._apply_line_anomalies(anomalies, month, code, inv_lines)
                if not inv_lines:
                    continue
                for k, (_, line) in enumerate(inv_lines, start=1):
                    line["line_number"] = k
                subtotal = sum((Decimal(str(l["line_amount"])) for _, l in inv_lines), Decimal("0"))
                tax = money(subtotal * GST)
                terms = 30
                head = {"invoice_number": inv_no, "customer_code": code, "contract_number": f"CTR-{code[5:]}",
                        "issue_date": m_end, "due_date": m_end + timedelta(days=terms), "currency": "INR", "status": "ISSUED",
                        "subtotal": money(subtotal), "tax_amount": tax, "total_amount": money(subtotal + tax)}
                headers.append(head)
                lines.extend(l for _, l in inv_lines)
                self.invoice_index.append({**head, "month": month})
                # duplicate invoice anomaly: same charges re-issued under a new number
                if (month, code) in anomalies.get("DUPLICATE_INVOICE", {}):
                    n += 1
                    dup_no = f"INV-{month:%y%m}-{n:05d}"
                    dup = {**head, "invoice_number": dup_no, "issue_date": m_end, "due_date": m_end + timedelta(days=terms)}
                    headers.append(dup)
                    for _, l in inv_lines:
                        lines.append({**l, "invoice_number": dup_no})
                    self.invoice_index.append({**dup, "month": month, "duplicate_of": inv_no})
                    self.truth.append(Truth("DUPLICATE_INVOICE", code, dup_no, month, money(subtotal),
                                            f"{dup_no} re-bills every charge already billed on {inv_no}"))
            month = add_months(month, 1)
        import_records_direct(self.db, self.tenant.id, "invoices", headers, "synthetic_invoices.csv")
        import_records_direct(self.db, self.tenant.id, "invoice_lines", lines, "synthetic_invoice_lines.csv")

    def _line(self, ob, inv_no: str, ln_no: int) -> dict | None:
        calc = ob.calc
        if calc is None:
            # Billing system kept billing a contract whose terms lapsed (version gap) — bill last month's amount.
            return None
        total = calc.total
        if total == 0 and ob.charge_type == "USAGE":
            return None  # nothing billable
        gross = sum((c.amount for c in calc.components if c.component_type != "DISCOUNT"), Decimal("0"))
        qty = calc.expected_quantity if calc.expected_quantity else Decimal("1")
        unit = calc.expected_unit_price if calc.expected_unit_price is not None else (gross / qty if qty else gross)
        line = {"invoice_number": inv_no, "line_number": ln_no, "subscription_code": ob.subscription_code,
                "product_code": "P-" + ob.subscription_code.rsplit("-", 1)[-1], "charge_type": ob.charge_type,
                "description": f"{ob.subscription_code} {ob.charge_type.lower()} {ob.period_start:%b %Y}",
                "period_start": ob.period_start, "period_end": ob.period_end, "quantity": money(qty) if ob.charge_type == "USAGE" else qty,
                "unit_price": unit.quantize(Decimal("0.0001")), "discount_pct": calc.expected_discount_pct or Decimal("0"),
                "discount_amount": money(gross - total), "line_amount": total,
                "billing_obligation_ref": ob.key if self.r.random() < 0.3 else None}
        return line

    def _anomaly_plan(self) -> dict:
        """Which (month, customer) pairs get which anomaly. Chosen deterministically."""
        r = self.r
        meta = self.cust_meta
        by_name = {m["name"]: c for c, m in meta.items()}
        eligible = [c for c, m in meta.items() if m["start"] < WINDOW_START and m["end"] is None and m["index"] not in (61, 63, 65)]
        r.shuffle(eligible)
        pool = iter(c for c in eligible if meta[c]["name"] not in FEATURED)
        oct_ = date(2026, 10, 1)
        plan: dict[str, dict] = defaultdict(dict)
        def pick(pred=lambda m: True):
            for c in pool:
                if pred(meta[c]):
                    return c
            raise RuntimeError("anomaly pool exhausted")
        # --- October (headline month): 14 billing anomalies
        plan["UNDERBILL_SEATS"][(oct_, by_name["TechNova Pvt. Ltd."])] = Decimal("0.80")
        plan["UNDERBILL_SEATS"][(oct_, pick())] = Decimal("0.90")
        plan["UNDERBILL_USAGE_QTY"][(oct_, pick(lambda m: m["api"] and not m["stor"]))] = Decimal("0.70")
        plan["OVERBILL_QTY"][(oct_, pick(lambda m: m["anly"]))] = Decimal("2")
        plan["OVERBILL_USAGE_QTY"][(oct_, pick(lambda m: m["api"]))] = Decimal("1.25")
        plan["MISSING_RECURRING"][(oct_, pick(lambda m: m["anly"]))] = "ANLY"
        plan["MISSING_RECURRING"][(oct_, pick(lambda m: m["supp"]))] = "SUPP"
        plan["DISCOUNT_DRIFT"][(oct_, by_name["InfiniIT Services"])] = Decimal("15")
        plan["DISCOUNT_DRIFT"][(oct_, pick(lambda m: m["segment"] != "SMB"))] = Decimal("20")
        plan["PRICE_MISMATCH"][(oct_, by_name["CloudCore Solutions"])] = ("CORE", Decimal("800"))
        plan["PRICE_MISMATCH"][(oct_, pick(lambda m: m["stor"] and m["segment"] == "ENTERPRISE"))] = ("STOR", Decimal("15"))
        plan["DUPLICATE_INVOICE"][(oct_, pick())] = True
        plan["UNBILLED_USAGE"][(oct_, by_name["DataCrest Technologies"])] = "API"
        # --- earlier months: a smaller, varied set so trends exist
        for m in (date(2026, 5, 1), date(2026, 6, 1), date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1)):
            plan["UNDERBILL_SEATS"][(m, pick())] = Decimal(r.choice(["0.85", "0.90", "0.75"]))
            plan["MISSING_RECURRING"][(m, pick(lambda x: x["anly"]))] = "ANLY"
            if m.month in (6, 8, 9):
                plan["PRICE_MISMATCH"][(m, pick())] = ("CORE", None)
            if m.month in (7, 9):
                plan["UNBILLED_USAGE"][(m, pick(lambda x: x["api"]))] = "API"
            if m.month == 8:
                plan["DISCOUNT_DRIFT"][(m, pick(lambda x: x["segment"] != "SMB"))] = Decimal("25")
        return plan

    def _apply_line_anomalies(self, plan: dict, month: date, code: str, inv_lines: list) -> list:
        key = (month, code)
        out = []
        for ob, line in inv_lines:
            sfx = ob.subscription_code.rsplit("-", 1)[-1]
            exp = Decimal(str(line["line_amount"]))
            if key in plan["MISSING_RECURRING"] and sfx == plan["MISSING_RECURRING"][key]:
                self.truth.append(Truth("MISSING_CHARGE", code, ob.key, month, exp, f"{sfx} recurring charge omitted from the invoice"))
                continue
            if key in plan["UNBILLED_USAGE"] and sfx == plan["UNBILLED_USAGE"][key]:
                self.truth.append(Truth("UNBILLED_USAGE", code, ob.key, month, exp, f"{sfx} usage for the month was never invoiced"))
                continue
            if key in plan["UNDERBILL_SEATS"] and sfx == "CORE":
                f = plan["UNDERBILL_SEATS"][key]
                self._rescale_qty(line, f, integer=True)
                self.truth.append(Truth("UNDERBILLING", code, ob.key, month, exp - Decimal(str(line["line_amount"])),
                                        f"Billed {line['quantity']} seats instead of the contracted quantity"))
            elif key in plan["UNDERBILL_USAGE_QTY"] and sfx in ("API", "STOR") and ob.calc.expected_unit_price is not None:
                self._rescale_qty(line, plan["UNDERBILL_USAGE_QTY"][key])
                self.truth.append(Truth("UNDERBILLING", code, ob.key, month, exp - Decimal(str(line["line_amount"])),
                                        "Usage invoiced below metered billable quantity"))
            elif key in plan["UNDERBILL_USAGE_QTY"] and sfx == "API":
                new = money(exp * plan["UNDERBILL_USAGE_QTY"][key])
                line["quantity"] = money(Decimal(str(line["quantity"])) * plan["UNDERBILL_USAGE_QTY"][key])
                line["line_amount"] = new
                line["unit_price"] = (new / line["quantity"]).quantize(Decimal("0.0001")) if line["quantity"] else line["unit_price"]
                self.truth.append(Truth("UNDERBILLING", code, ob.key, month, exp - new, "Tiered API usage invoiced below metered volume"))
            elif key in plan["OVERBILL_QTY"] and sfx == "ANLY":
                self._rescale_qty(line, plan["OVERBILL_QTY"][key], integer=True)
                self.truth.append(Truth("OVERBILLING", code, ob.key, month, Decimal(str(line["line_amount"])) - exp,
                                        "Analytics add-on billed for 2 workspaces; contract covers 1"))
            elif key in plan["OVERBILL_USAGE_QTY"] and sfx == "API":
                f = plan["OVERBILL_USAGE_QTY"][key]
                new = money(exp * f)
                line["quantity"] = money(Decimal(str(line["quantity"])) * f)
                line["line_amount"] = new
                line["unit_price"] = (new / line["quantity"]).quantize(Decimal("0.0001"))
                self.truth.append(Truth("OVERBILLING", code, ob.key, month, new - exp, "API usage invoiced above metered volume"))
            elif key in plan["DISCOUNT_DRIFT"] and sfx == "CORE" and ob.calc.expected_discount_pct is not None:
                pct_ = plan["DISCOUNT_DRIFT"][key]
                gross = Decimal(str(line["line_amount"])) + Decimal(str(line["discount_amount"]))
                disc = money(gross * pct_ / 100)
                line["discount_pct"], line["discount_amount"], line["line_amount"] = pct_, disc, money(gross - disc)
                self.truth.append(Truth("DISCOUNT_DRIFT", code, ob.key, month, exp - line["line_amount"],
                                        f"Invoice discount {pct_}% vs contractual {ob.calc.expected_discount_pct}%"))
            elif key in plan["PRICE_MISMATCH"] and sfx == plan["PRICE_MISMATCH"][key][0] and ob.calc.expected_unit_price is not None:
                new_price = plan["PRICE_MISMATCH"][key][1] or money(ob.calc.expected_unit_price * Decimal("0.90"))
                qty = Decimal(str(line["quantity"]))
                gross = money(qty * new_price)
                disc_pct = Decimal(str(line["discount_pct"]))
                disc = money(gross * disc_pct / 100)
                line["unit_price"], line["discount_amount"], line["line_amount"] = new_price, disc, money(gross - disc)
                self.truth.append(Truth("PRICING_MISMATCH", code, ob.key, month, abs(line["line_amount"] - exp),
                                        f"Invoiced at {new_price}/unit vs contract {ob.calc.expected_unit_price}/unit"))
            out.append((ob, line))
        return out

    @staticmethod
    def _rescale_qty(line: dict, factor: Decimal, integer: bool = False) -> None:
        qty = Decimal(str(line["quantity"])) * factor
        qty = qty.to_integral_value() if integer else money(qty)
        unit = Decimal(str(line["unit_price"]))
        gross = money(qty * unit)
        disc = money(gross * Decimal(str(line["discount_pct"])) / 100)
        line["quantity"], line["discount_amount"], line["line_amount"] = qty, disc, money(gross - disc)

    # ------------------------------------------------------------------ cash
    def cash(self) -> None:
        r = self.r
        payments, allocs, credits = [], [], []
        # Credits: a handful of approved service credits; the customer pays the net amount
        credit_by_inv: dict[str, Decimal] = {}
        for k, inv in enumerate([i for i in self.invoice_index if not i.get("duplicate_of")][5::97][:12], start=1):
            amt = money(Decimal(str(inv["subtotal"])) * Decimal("0.05"))
            credit_by_inv[inv["invoice_number"]] = amt
            credits.append({"credit_number": f"CN-{k:05d}", "customer_code": inv["customer_code"], "invoice_number": inv["invoice_number"],
                            "adjustment_type": "CREDIT_NOTE", "amount": amt, "reason": "Service-level credit (SLA breach)",
                            "status": "APPROVED", "effective_date": inv["issue_date"] + timedelta(days=5)})
        pn = 0
        for inv in self.invoice_index:
            total = Decimal(str(inv["total_amount"])) - credit_by_inv.get(inv["invoice_number"], Decimal("0"))
            if inv.get("duplicate_of"):
                continue  # customer (rightly) does not pay the duplicate
            roll = r.random()
            issue = inv["issue_date"]
            if roll < 0.72:
                paid, when = total, issue + timedelta(days=r.randint(2, 14))
            elif roll < 0.88:
                paid, when = total, issue + timedelta(days=r.randint(15, 50))
            elif roll < 0.95:
                paid, when = money(total * Decimal(r.choice(["0.5", "0.6", "0.75"]))), issue + timedelta(days=r.randint(10, 45))
            else:
                continue  # unpaid
            if when > DATA_AS_OF:
                continue
            pn += 1
            pno = f"PAY-{pn:06d}"
            payments.append({"payment_number": pno, "customer_code": inv["customer_code"], "received_on": when, "amount": paid,
                             "currency": "INR", "method": r.choice(["BANK_TRANSFER", "BANK_TRANSFER", "UPI", "CARD"]),
                             "transaction_reference": f"UTR{SEED % 1000}{pn:08d}", "remittance_invoice_ref": inv["invoice_number"]})
            allocs.append({"payment_number": pno, "invoice_number": inv["invoice_number"], "amount": paid, "allocated_on": when})
        # ---- injected payment discrepancies (October window)
        oct_invs = [i for i in self.invoice_index if i["month"] == date(2026, 10, 1) and not i.get("duplicate_of")]
        a, b, c = oct_invs[11], oct_invs[23], oct_invs[37]
        pn += 1
        payments.append({"payment_number": f"PAY-{pn:06d}", "customer_code": a["customer_code"], "received_on": date(2026, 10, 20),
                         "amount": Decimal("45000.00"), "transaction_reference": f"UTR-UNAPPLIED-{pn}", "remittance_invoice_ref": ""})
        self.truth.append(Truth("PAYMENT_DISCREPANCY", a["customer_code"], f"PAY-{pn:06d}", date(2026, 10, 1), Decimal("45000.00"),
                                "Payment received but never allocated to an invoice"))
        # duplicate transaction reference: same UTR, customer and amount entered twice
        first = next(p for p in payments if p["received_on"] >= date(2026, 10, 1) and p["customer_code"] == b["customer_code"]) \
            if any(p["received_on"] >= date(2026, 10, 1) and p["customer_code"] == b["customer_code"] for p in payments) else None
        if first is None:
            first = next(p for p in payments if p["received_on"] >= date(2026, 10, 1))
        pn += 1
        payments.append({**first, "payment_number": f"PAY-{pn:06d}"})
        allocs.append({"payment_number": f"PAY-{pn:06d}", "invoice_number": first["remittance_invoice_ref"],
                       "amount": first["amount"], "allocated_on": first["received_on"]})
        self.truth.append(Truth("PAYMENT_DISCREPANCY", first["customer_code"], f"PAY-{pn:06d}", date(2026, 10, 1), Decimal(str(first["amount"])),
                                f"Duplicate entry of transaction {first['transaction_reference']}"))
        # allocation to another customer's invoice
        pn += 1
        amount = money(Decimal(str(c["total_amount"])) * Decimal("0.5"))
        payments.append({"payment_number": f"PAY-{pn:06d}", "customer_code": a["customer_code"], "received_on": date(2026, 10, 25),
                         "amount": amount, "transaction_reference": f"UTR-XCUST-{pn}", "remittance_invoice_ref": c["invoice_number"]})
        allocs.append({"payment_number": f"PAY-{pn:06d}", "invoice_number": c["invoice_number"], "amount": amount, "allocated_on": date(2026, 10, 25)})
        self.truth.append(Truth("PAYMENT_DISCREPANCY", a["customer_code"], f"PAY-{pn:06d}", date(2026, 10, 1), amount,
                                f"Allocated to invoice {c['invoice_number']} of customer {c['customer_code']}"))
        for p in payments:
            p.setdefault("currency", "INR")
            p.setdefault("method", "BANK_TRANSFER")
        import_records_direct(self.db, self.tenant.id, "payments", payments, "synthetic_payments.csv")
        import_records_direct(self.db, self.tenant.id, "payment_allocations", allocs, "synthetic_payment_allocations.csv")
        import_records_direct(self.db, self.tenant.id, "credit_adjustments", credits, "synthetic_credit_adjustments.csv")

    # ------------------------------------------------------------------ costs
    def costs(self) -> None:
        r = self.r
        rows = []
        month = WINDOW_START
        heavy = [c for c, m in self.cust_meta.items() if m["index"] % 9 == 4][:24]  # expensive-to-serve accounts
        medium = [c for c, m in self.cust_meta.items() if m["index"] % 9 == 7][:38]
        while month <= WINDOW_END:
            rows += [
                {"product_code": "P-CORE", "period_month": month, "cost_type": "COMPUTE", "amount": money(Decimal(r.randint(2_700_000, 2_900_000))), "allocation_basis": "SEATS", "description": "Application cluster"},
                {"product_code": "P-CORE", "period_month": month, "cost_type": "INFRASTRUCTURE", "amount": money(Decimal(r.randint(1_000_000, 1_100_000))), "allocation_basis": "SEATS", "description": "Databases & networking"},
                {"product_code": "P-API", "period_month": month, "cost_type": "COMPUTE", "amount": money(Decimal(r.randint(700_000, 780_000))), "allocation_basis": "USAGE", "description": "API gateway & workers"},
                {"product_code": "P-API", "period_month": month, "cost_type": "THIRD_PARTY", "amount": money(Decimal(r.randint(150_000, 180_000))), "allocation_basis": "USAGE", "description": "Third-party enrichment APIs"},
                {"product_code": "P-STOR", "period_month": month, "cost_type": "INFRASTRUCTURE", "amount": money(Decimal(r.randint(380_000, 430_000))), "allocation_basis": "USAGE", "description": "Object storage"},
                {"product_code": "P-ANLY", "period_month": month, "cost_type": "COMPUTE", "amount": money(Decimal(r.randint(300_000, 340_000))), "allocation_basis": "REVENUE", "description": "Analytics warehouse"},
                {"product_code": "P-CORE", "period_month": month, "cost_type": "PAYMENT_PROCESSING", "amount": money(Decimal(r.randint(150_000, 190_000))), "allocation_basis": "REVENUE", "description": "Gateway & bank fees"},
            ]
            for c in heavy:
                if self.cust_meta[c]["start"] <= month_end(month) and (self.cust_meta[c]["end"] is None or self.cust_meta[c]["end"] >= month):
                    seg = self.cust_meta[c]["segment"]
                    amt = {"ENTERPRISE": 150_000, "MID_MARKET": 60_000, "SMB": 20_000}[seg] * r.uniform(0.9, 1.3)
                    rows.append({"product_code": "P-SUPP", "customer_code": c, "period_month": month, "cost_type": "SUPPORT",
                                 "amount": money(Decimal(int(amt))), "allocation_basis": "DIRECT", "description": "Dedicated support engineering hours"})
            for c in medium:
                if self.cust_meta[c]["start"] <= month_end(month) and (self.cust_meta[c]["end"] is None or self.cust_meta[c]["end"] >= month):
                    seg = self.cust_meta[c]["segment"]
                    amt = {"ENTERPRISE": 30_000, "MID_MARKET": 11_000, "SMB": 2_500}[seg] * r.uniform(0.9, 1.2)
                    rows.append({"product_code": "P-SUPP", "customer_code": c, "period_month": month, "cost_type": "SUPPORT",
                                 "amount": money(Decimal(int(amt))), "allocation_basis": "DIRECT", "description": "Customer success & support hours"})
            month = add_months(month, 1)
        import_records_direct(self.db, self.tenant.id, "product_costs", rows, "synthetic_product_costs.csv")

    def save_truth(self) -> None:
        for k, t in enumerate(self.truth, start=1):
            self.db.add(SyntheticGroundTruth(tenant_id=self.tenant.id, category=t.category, customer_code=t.customer_code,
                                             reference=t.reference, period_start=t.period_start, expected_impact=money(t.impact),
                                             description=t.description, seq=k))


def demo_users(db: Session, tenant: Tenant, password: str) -> None:
    roles = {r.name: r for r in db.scalars(select(Role))}
    for email, name, title, role in (
        ("piyush@demo.local", "Piyush Tandale", "Revenue Operations", "ADMIN"),
        ("analyst@demo.local", "Demo Analyst", "Finance Analyst", "ANALYST"),
        ("viewer@demo.local", "Demo Viewer", "Executive (read-only)", "VIEWER"),
    ):
        if db.scalar(select(User).where(User.tenant_id == tenant.id, User.email == email)) is None:
            db.add(User(tenant_id=tenant.id, email=email, full_name=name, title=title,
                        password_hash=hash_password(password), role_id=roles[role].id))


def seed_demo_dataset(db: Session, tenant: Tenant) -> bool:
    """Create the demonstration dataset once. Returns False if data already exists."""
    if db.scalar(select(func.count(ImportBatch.id)).where(ImportBatch.tenant_id == tenant.id, ImportBatch.data_origin == "SYNTHETIC_DEMO")):
        return False
    if db.scalar(select(func.count(Customer.id)).where(Customer.tenant_id == tenant.id)):
        return False  # tenant has real data; never mix demo data in
    started = datetime.now(UTC)
    g = Generator(db, tenant)
    g.reference()
    g.usage()
    g.costs()
    db.flush()
    g.invoices()
    g.cash()
    g.save_truth()
    db.flush()
    log.info("synthetic demo dataset created", extra={"duration_ms": int((datetime.now(UTC) - started).total_seconds() * 1000)})
    return True
