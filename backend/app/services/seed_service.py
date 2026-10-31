import random
from datetime import datetime, date, timedelta
from decimal import Decimal
import json
from sqlalchemy.orm import Session
from backend.app.core.database import SessionLocal, engine, Base
from backend.app.models.entities import (
    User, Customer, Product, Contract, ContractVersion, Subscription,
    UsageEvent, Invoice, InvoiceLine, Payment, PaymentAllocation,
    CreditAdjustment, ProductCost, ExceptionRecord, ExceptionEvidence,
    InvestigationNote, UploadBatch, AuditLog, NotificationEvent,
    AppSettings
)
from backend.app.security.auth import get_password_hash
from backend.app.analytics.financial_engine import quantize_money

def seed_database(db: Session, force_reset: bool = False):
    """
    Generates a realistic, reproducible synthetic dataset matching the master
    SaaS Revenue Assurance dashboard reference and element specification.
    Contains ~218 active customers, products, multi-period invoices, usage, payments,
    and 14 precisely crafted anomalies matching all 8 categories.
    """
    random.seed(42)

    # Check if already seeded
    existing_users = db.query(User).count()
    if existing_users > 0 and not force_reset:
        return {"status": "already_seeded", "customers": db.query(Customer).count()}

    if force_reset:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    print("Seeding initial users and administrative accounts...")
    # 1. Users
    admin_user = User(
        email="admin@saas-assurance.io",
        full_name="Piyush Tandale",
        hashed_password=get_password_hash("Admin@123"),
        role="Admin",
        is_active=True
    )
    analyst_user = User(
        email="analyst@saas-assurance.io",
        full_name="Financial Analyst",
        hashed_password=get_password_hash("Analyst@123"),
        role="Analyst",
        is_active=True
    )
    viewer_user = User(
        email="viewer@saas-assurance.io",
        full_name="Executive Viewer",
        hashed_password=get_password_hash("Viewer@123"),
        role="Viewer",
        is_active=True
    )
    db.add_all([admin_user, analyst_user, viewer_user])
    db.flush()

    # 2. SaaS Products
    print("Seeding SaaS product catalogue...")
    products = [
        Product(
            product_code="PROD-CORE-ENT",
            name="Enterprise Core Platform",
            category="Platform",
            base_fee=Decimal("150000.00"),
            metered_unit="Active Users",
            rate_per_unit=Decimal("500.0000")
        ),
        Product(
            product_code="PROD-API-SUITE",
            name="Data Pipeline & API Services",
            category="API Services",
            base_fee=Decimal("50000.00"),
            metered_unit="API Calls (k)",
            rate_per_unit=Decimal("30.0000")  # ₹30 per 1,000 API calls
        ),
        Product(
            product_code="PROD-ANALYTICS",
            name="High-Throughput Analytics Engine",
            category="Analytics",
            base_fee=Decimal("80000.00"),
            metered_unit="Compute Hours",
            rate_per_unit=Decimal("25.0000")
        ),
        Product(
            product_code="PROD-STORAGE",
            name="Enterprise Cloud Storage",
            category="Storage",
            base_fee=Decimal("25000.00"),
            metered_unit="GB Stored",
            rate_per_unit=Decimal("15.0000")
        ),
        Product(
            product_code="PROD-PREM-SUPP",
            name="24/7 Mission-Critical Support",
            category="Add-on",
            base_fee=Decimal("40000.00"),
            metered_unit="Incidents",
            rate_per_unit=Decimal("0.0000")
        )
    ]
    db.add_all(products)
    db.flush()

    # 3. Seed Customers (~218 total customers: 156 Profitable, 38 At-Risk, 24 Unprofitable)
    print("Seeding 218 SaaS customers with segments and contracts...")
    
    # Specific featured customers from the dashboard screenshot
    featured_customers_data = [
        ("TechNova Pvt. Ltd.", "Enterprise", "Enterprise", "technova.io", "Active", 92.5),
        ("CloudCore Solutions", "Mid-Market", "Professional", "cloudcore.tech", "Active", 84.0),
        ("DataCrest Technologies", "Enterprise", "Enterprise", "datacrest.ai", "Active", 88.0),
        ("InfiniIT Services", "Mid-Market", "Professional", "infiniit.co", "Active", 79.5),
        ("AuraHealth Global", "Enterprise", "Enterprise", "aurahealth.com", "Active", 96.0),
        ("Apex FinCorp", "Enterprise", "Enterprise", "apexfin.in", "Active", 94.0),
        ("ZetaMetrics AI", "Startup", "Growth", "zetametrics.io", "Active", 91.0),
        ("Nexus Logistics", "Mid-Market", "Professional", "nexuslog.com", "At-Risk", 64.0),
        ("Vortex Systems", "Enterprise", "Enterprise", "vortexsys.com", "At-Risk", 58.0),
        ("HyperScale Media", "SMB", "Growth", "hyperscale.net", "Active", 82.0),
    ]

    segments = ["Enterprise", "Mid-Market", "SMB", "Startup"]
    tiers = ["Enterprise", "Professional", "Growth", "Starter"]
    all_customers = []

    # Add featured customers
    for idx, (name, seg, tier, domain, status, health) in enumerate(featured_customers_data):
        c = Customer(
            customer_code=f"CUST-{1000 + idx}",
            name=name,
            domain=domain,
            segment=seg,
            plan_tier=tier,
            status=status,
            billing_currency="INR",
            payment_terms_days=30,
            health_score=Decimal(str(health)),
            health_status="Healthy" if health >= 80 else ("Attention" if health >= 65 else "Critical"),
            contact_email=f"finance@{domain}",
            created_at=datetime(2025, 1, 15)
        )
        all_customers.append(c)

    # Generate remaining customers to reach exactly 218:
    # 156 Profitable, 38 At-Risk, 24 Unprofitable
    company_prefixes = [
        "Quantum", "Cyber", "Starlight", "Orbit", "BluePeak", "Vertex", "Pulse", "Synthetix",
        "Omni", "Solaris", "Alpha", "Zenith", "Beacon", "Crest", "Titan", "Horizon", "Strata",
        "Krypton", "Cobalt", "Silverline", "Prism", "Vanguard", "Aether", "Dynamic", "Velocity"
    ]
    company_suffixes = ["Technologies", "Labs", "Solutions", "Networks", "Pvt. Ltd.", "Cloud", "Analytics", "Digital", "Infotech"]

    target_total = 218
    target_profitable = 156
    target_at_risk = 38
    target_unprofitable = 24

    for i in range(len(featured_customers_data), target_total):
        prefix = company_prefixes[i % len(company_prefixes)]
        suffix = company_suffixes[(i // len(company_prefixes)) % len(company_suffixes)]
        name = f"{prefix} {suffix} {i+1}"
        domain = f"{prefix.lower()}{i+1}.io"
        seg = random.choice(segments)
        tier = random.choice(tiers)

        # Distribute health
        if i < target_profitable:
            status = "Active"
            health = round(random.uniform(80.0, 98.0), 1)
        elif i < target_profitable + target_at_risk:
            status = "At-Risk" if random.random() > 0.4 else "Active"
            health = round(random.uniform(55.0, 78.0), 1)
        else:
            status = "At-Risk" if random.random() > 0.3 else "Active"
            health = round(random.uniform(30.0, 54.0), 1)

        c = Customer(
            customer_code=f"CUST-{1000 + i}",
            name=name,
            domain=domain,
            segment=seg,
            plan_tier=tier,
            status=status,
            billing_currency="INR",
            payment_terms_days=random.choice([15, 30, 45]),
            health_score=Decimal(str(health)),
            health_status="Healthy" if health >= 80 else ("Attention" if health >= 65 else "Critical"),
            contact_email=f"billing@{domain}",
            created_at=datetime(2025, 3, 1) + timedelta(days=i * 2)
        )
        all_customers.append(c)

    db.add_all(all_customers)
    db.flush()

    # 4. Contracts, Subscriptions, Usage, Invoices across 6 months (May to Oct 2026)
    print("Seeding multi-month contracts, subscriptions, and financial records...")
    months = [
        (2026, 5, "May"),
        (2026, 6, "Jun"),
        (2026, 7, "Jul"),
        (2026, 8, "Aug"),
        (2026, 9, "Sep"),
        (2026, 10, "Oct")
    ]

    all_contracts = []
    all_versions = []
    all_subscriptions = []
    all_invoices = []
    all_invoice_lines = []
    all_payments = []
    all_allocations = []
    all_costs = []
    all_usage = []

    for cust in all_customers:
        # Create contract
        contract = Contract(
            contract_number=f"CNT-2026-{cust.customer_code[5:]}",
            customer_id=cust.id,
            start_date=date(2026, 1, 1),
            end_date=date(2027, 1, 1),
            auto_renew=True,
            status="Active"
        )
        all_contracts.append(contract)

    db.add_all(all_contracts)
    db.flush()

    # For versions & subscriptions
    for contract in all_contracts:
        cust = next(c for c in all_customers if c.id == contract.customer_id)
        # Select base product based on tier
        fixed_base = Decimal("150000.00") if cust.plan_tier == "Enterprise" else (
            Decimal("80000.00") if cust.plan_tier == "Professional" else Decimal("35000.00")
        )
        discount = Decimal("10.00") if cust.name == "InfiniIT Services" else (
            Decimal("15.00") if cust.segment == "Enterprise" else Decimal("0.00")
        )

        version = ContractVersion(
            contract_id=contract.id,
            version_number=1,
            effective_from=date(2026, 1, 1),
            effective_to=date(2027, 1, 1),
            fixed_fee=fixed_base,
            included_units=100 if cust.plan_tier == "Enterprise" else 20,
            overage_rate=Decimal("600.0000") if cust.name == "CloudCore Solutions" else Decimal("500.0000"),
            discount_pct=discount,
            status="Active",
            is_current=True
        )
        all_versions.append(version)

    db.add_all(all_versions)
    db.flush()

    for version in all_versions:
        contract = next(c for c in all_contracts if c.id == version.contract_id)
        cust = next(c for c in all_customers if c.id == contract.customer_id)

        # Primary subscription
        sub1 = Subscription(
            customer_id=cust.id,
            product_id=products[0].id,
            contract_version_id=version.id,
            billing_cycle="Monthly",
            status="Active",
            start_date=date(2026, 1, 1),
            mrr=version.fixed_fee * (Decimal("1.0") - version.discount_pct / Decimal("100.0")),
            quantity=1
        )
        all_subscriptions.append(sub1)

        # Secondary API or Storage subscription for 60% of customers
        if hash(cust.id) % 2 == 0:
            sub2 = Subscription(
                customer_id=cust.id,
                product_id=products[1].id,
                contract_version_id=version.id,
                billing_cycle="Monthly",
                status="Active",
                start_date=date(2026, 1, 1),
                mrr=products[1].base_fee,
                quantity=1
            )
            all_subscriptions.append(sub2)

    db.add_all(all_subscriptions)
    db.flush()

    # Generate historical monthly invoices and direct costs for May through Oct
    inv_counter = 1000
    pay_counter = 1000

    for year, month, m_name in months:
        period_str = f"{year}-{month:02d}"
        p_start = date(year, month, 1)
        p_end = date(year, month, 28)

        for cust in all_customers:
            cust_subs = [s for s in all_subscriptions if s.customer_id == cust.id]
            expected_total = sum([s.mrr for s in cust_subs], Decimal("0.00"))

            # Calculate direct service costs for unit economics
            # Profitable customers: direct cost ~ 25% - 40% of revenue
            # At-Risk: direct cost ~ 60% - 85% of revenue
            # Unprofitable: direct cost ~ 105% - 140% of revenue
            if cust.health_score >= 80:
                cost_ratio = Decimal(str(random.uniform(0.28, 0.42)))
            elif cust.health_score >= 60:
                cost_ratio = Decimal(str(random.uniform(0.65, 0.88)))
            else:
                cost_ratio = Decimal(str(random.uniform(1.05, 1.35)))

            direct_cost = quantize_money(expected_total * cost_ratio)
            infra_part = quantize_money(direct_cost * Decimal("0.45"))
            comp_part = quantize_money(direct_cost * Decimal("0.30"))
            supp_part = quantize_money(direct_cost * Decimal("0.15"))
            third_part = direct_cost - (infra_part + comp_part + supp_part)

            prod_cost = ProductCost(
                customer_id=cust.id,
                product_id=products[0].id,
                period=period_str,
                infrastructure_cost=infra_part,
                compute_cost=comp_part,
                support_cost=supp_part,
                third_party_cost=third_part,
                total_direct_cost=direct_cost
            )
            all_costs.append(prod_cost)

            # Invoices: Default billed = expected_total
            billed_subtotal = expected_total

            # For October 2026, inject the exact known anomalies for specific featured customers!
            if month == 10:
                if cust.name == "TechNova Pvt. Ltd.":
                    # Anomaly 1: Underbilled: Billed ₹2,40,000 vs expected ₹3,00,000 -> Impact ₹60,000
                    billed_subtotal = Decimal("240000.00")
                elif cust.name == "CloudCore Solutions":
                    # Anomaly 2: Pricing Mismatch: contract ₹600/unit, invoiced ₹800/unit across 600 units -> +₹1,20,000
                    billed_subtotal = expected_total + Decimal("120000.00")
                elif cust.name == "DataCrest Technologies":
                    # Anomaly 3: Missing Charges: 2,400 additional API calls not invoiced -> ₹72,000
                    billed_subtotal = expected_total  # Base invoiced, but 2,400 calls omitted
                elif cust.name == "InfiniIT Services":
                    # Anomaly 4: Discount Drift: 15% discount applied vs 10% contract
                    billed_subtotal = expected_total - Decimal("54000.00")

            inv_counter += 1
            inv_num = f"INV-{year}{month:02d}-{inv_counter}"
            tax = quantize_money(billed_subtotal * Decimal("0.18"))
            total = billed_subtotal + tax

            # Payment status: In Oct, some outstanding balance for dashboard
            if month < 10:
                paid = total
                inv_status = "Paid"
            else:
                # Oct 2026: ~₹13,20,000 total outstanding across customers
                if cust.name in ["TechNova Pvt. Ltd.", "Vortex Systems", "Nexus Logistics"]:
                    paid = Decimal("0.00")
                    inv_status = "Overdue"
                elif random.random() < 0.15:
                    paid = quantize_money(total * Decimal("0.50"))
                    inv_status = "Partial"
                else:
                    paid = total
                    inv_status = "Paid"

            balance = total - paid

            import uuid
            inv_id = str(uuid.uuid4())
            invoice = Invoice(
                id=inv_id,
                invoice_number=inv_num,
                customer_id=cust.id,
                billing_period_start=p_start,
                billing_period_end=p_end,
                issue_date=p_start + timedelta(days=2),
                due_date=p_start + timedelta(days=32),
                subtotal=billed_subtotal,
                tax_amount=tax,
                total_amount=total,
                paid_amount=paid,
                balance_due=balance,
                status=inv_status
            )
            all_invoices.append(invoice)

            # Invoice line
            line = InvoiceLine(
                id=str(uuid.uuid4()),
                invoice_id=inv_id,
                product_id=products[0].id,
                description=f"{products[0].name} - {m_name} {year}",
                quantity=Decimal("1.00"),
                unit_price=billed_subtotal,
                discount_pct=Decimal("15.00") if (month == 10 and cust.name == "InfiniIT Services") else (Decimal("10.00") if cust.name == "InfiniIT Services" else Decimal("0.00")),
                line_total=billed_subtotal,
                line_type="Fixed"
            )
            all_invoice_lines.append(line)

            # Payment record if paid > 0
            if paid > Decimal("0.00"):
                pay_counter += 1
                pmt_id = str(uuid.uuid4())
                pmt = Payment(
                    id=pmt_id,
                    payment_reference=f"PAY-{year}{month:02d}-{pay_counter}",
                    customer_id=cust.id,
                    payment_date=p_start + timedelta(days=15),
                    amount=paid,
                    payment_method=random.choice(["NEFT/RTGS", "Corporate Card", "Bank Wire"]),
                    allocated_amount=paid,
                    unallocated_amount=Decimal("0.00"),
                    status="Processed"
                )
                all_payments.append(pmt)

                alloc = PaymentAllocation(
                    id=str(uuid.uuid4()),
                    payment_id=pmt_id,
                    invoice_id=inv_id,
                    allocated_amount=paid,
                    allocated_at=datetime(year, month, 15)
                )
                all_allocations.append(alloc)

    db.add_all(all_costs)
    db.add_all(all_invoices)
    db.add_all(all_invoice_lines)
    db.add_all(all_payments)
    db.add_all(all_allocations)
    db.flush()

    # 5. Seed Usage Events (especially for DataCrest with omitted API calls)
    print("Seeding customer usage events...")
    datacrest = next((c for c in all_customers if c.name == "DataCrest Technologies"), all_customers[2])
    usage_event_omitted = UsageEvent(
        customer_id=datacrest.id,
        product_id=products[1].id,
        usage_date=date(2026, 10, 20),
        metric_name="API Calls (k)",
        quantity=Decimal("2400.00"),
        processed=False  # Omitted from billing!
    )
    all_usage.append(usage_event_omitted)

    # General usage for others
    for cust in all_customers[:40]:
        all_usage.append(UsageEvent(
            customer_id=cust.id,
            product_id=products[1].id,
            usage_date=date(2026, 10, 15),
            metric_name="API Calls (k)",
            quantity=Decimal(str(random.randint(50, 500))),
            processed=True
        ))
    db.add_all(all_usage)
    db.flush()

    # 6. Seed Exactly the 14 Anomalies from the Reference Screenshot & Elements Spec!
    print("Seeding 14 calibrated anomalies matching the master dashboard...")
    
    # 4 Underbilling (28.6%)
    # 2 Overbilling (14.3%)
    # 2 Missing Charges (14.3%)
    # 2 Discount Drift (14.3%)
    # 2 Pricing Mismatch (14.3%)
    # 2 Others (Payment Discrepancies / Duplicate Invoices) (14.2%)
    # Total = 14 Exceptions

    exceptions_specs = [
        # 1. TechNova Pvt. Ltd. (Underbilling - Open)
        {
            "customer_name": "TechNova Pvt. Ltd.",
            "issue_type": "Underbilling",
            "impact": Decimal("60000.00"),
            "status": "Open",
            "severity": "High",
            "desc": "Billed ₹2,40,000 vs expected ₹3,00,000",
            "calc": "Customer was contractually obligated for ₹3,00,000 (Fixed: ₹1,50,000 + Usage: ₹1,50,000), but only ₹2,40,000 was invoiced on INV-202610-1001. Underbilled leakage: ₹60,000."
        },
        # 2. CloudCore Solutions (Pricing Mismatch - In Progress)
        {
            "customer_name": "CloudCore Solutions",
            "issue_type": "Pricing Mismatch",
            "impact": Decimal("120000.00"),
            "status": "In Progress",
            "severity": "Critical",
            "desc": "Invoiced at ₹800/unit vs contract ₹600/unit",
            "calc": "Invoice INV-202610-1002 line item billed at ₹800.00/unit across 600 units, whereas Contract Version #1 stipulates ₹600.00/unit. Net mismatch = ₹1,20,000."
        },
        # 3. DataCrest Technologies (Missing Charges - Open)
        {
            "customer_name": "DataCrest Technologies",
            "issue_type": "Missing Charges",
            "impact": Decimal("72000.00"),
            "status": "Open",
            "severity": "High",
            "desc": "2,400 additional API calls not invoiced",
            "calc": "2,400 thousand API requests delivered on 2026-10-20 at rate ₹30/k were omitted from the October invoicing batch. Unbilled leakage: ₹72,000."
        },
        # 4. InfiniIT Services (Discount Drift - Resolved)
        {
            "customer_name": "InfiniIT Services",
            "issue_type": "Discount Drift",
            "impact": Decimal("54000.00"),
            "status": "Resolved",
            "severity": "High",
            "desc": "15% discount applied vs 10% in contract",
            "calc": "Billing engine applied an unapproved 15% discount instead of the contractually capped 10% discount on fixed fees of ₹1,08,000. Drift variance = ₹54,000.",
            "resolved_reason": "Contract amendment approved by Finance VP retroactively on Oct 28."
        },
        # 5. Underbilling #2
        {
            "customer_name": "Apex FinCorp",
            "issue_type": "Underbilling",
            "impact": Decimal("85000.00"),
            "status": "Open",
            "severity": "High",
            "desc": "Proration omitted for mid-month user expansion",
            "calc": "50 enterprise users provisioned on Oct 10th were billed on Nov cycle without mid-month prorated charge of ₹85,000."
        },
        # 6. Underbilling #3
        {
            "customer_name": "Vortex Systems",
            "issue_type": "Underbilling",
            "impact": Decimal("145000.00"),
            "status": "Open",
            "severity": "Critical",
            "desc": "Compute overage omitted from October bill",
            "calc": "5,800 compute hours beyond the 2,000 included allowance were dropped during data sync. Leakage = ₹1,45,000."
        },
        # 7. Underbilling #4
        {
            "customer_name": "Nexus Logistics",
            "issue_type": "Underbilling",
            "impact": Decimal("35000.00"),
            "status": "In Progress",
            "severity": "Medium",
            "desc": "Tier 2 storage charges unbilled",
            "calc": "Storage usage exceeded 2TB threshold; tier 2 rate of ₹15/GB was not charged for 2,333 GB = ₹35,000."
        },
        # 8. Overbilling #1
        {
            "customer_name": "AuraHealth Global",
            "issue_type": "Overbilling",
            "impact": Decimal("48000.00"),
            "status": "Open",
            "severity": "Medium",
            "desc": "Duplicate platform base charge on add-on invoice",
            "calc": "Platform base fee of ₹48,000 was invoiced on both parent invoice and supplementary add-on invoice."
        },
        # 9. Overbilling #2
        {
            "customer_name": "ZetaMetrics AI",
            "issue_type": "Overbilling",
            "impact": Decimal("92000.00"),
            "status": "In Progress",
            "severity": "High",
            "desc": "Inactive test environment billed as production",
            "calc": "Test cluster charged at full production rate ₹25/hr instead of zero-rated sandbox rate. Overcharge = ₹92,000."
        },
        # 10. Missing Charges #2
        {
            "customer_name": "HyperScale Media",
            "issue_type": "Missing Charges",
            "impact": Decimal("65000.00"),
            "status": "Open",
            "severity": "High",
            "desc": "Premium support rider omitted from renewal bill",
            "calc": "Support rider PROD-PREM-SUPP active in contract version was absent from generated renewal invoice."
        },
        # 11. Discount Drift #2
        {
            "customer_name": all_customers[10].name,
            "issue_type": "Discount Drift",
            "impact": Decimal("42000.00"),
            "status": "Open",
            "severity": "Medium",
            "desc": "Expired promotional discount auto-renewed",
            "calc": "Initial 3-month onboarding discount of 20% continued into month 4 without contract addendum."
        },
        # 12. Pricing Mismatch #2
        {
            "customer_name": all_customers[11].name,
            "issue_type": "Pricing Mismatch",
            "impact": Decimal("78000.00"),
            "status": "Open",
            "severity": "High",
            "desc": "Stale rate-card applied after annual price indexation",
            "calc": "Annual contract indexation of 6% applied to contract version but ERP invoice generated using legacy rate."
        },
        # 13. Others (Duplicate Invoices)
        {
            "customer_name": all_customers[12].name,
            "issue_type": "Duplicate Invoices",
            "impact": Decimal("38000.00"),
            "status": "Open",
            "severity": "Medium",
            "desc": "Parallel invoice generated during billing rerun",
            "calc": "Automated rerun generated parallel invoice with identical billing obligation."
        },
        # 14. Others (Payment Discrepancies)
        {
            "customer_name": all_customers[13].name,
            "issue_type": "Payment Discrepancies",
            "impact": Decimal("39000.00"),
            "status": "Open",
            "severity": "Medium",
            "desc": "Unallocated client wire transfer",
            "calc": "Wire transfer received without customer reference code, sitting unallocated in suspense ledger."
        }
    ]

    all_exceptions = []
    for idx, spec in enumerate(exceptions_specs):
        cust = next((c for c in all_customers if c.name == spec["customer_name"]), all_customers[0])
        exc_id = str(uuid.uuid4())
        exc = ExceptionRecord(
            id=exc_id,
            exception_code=f"EXC-2026-{1001 + idx}",
            customer_id=cust.id,
            issue_type=spec["issue_type"],
            severity=spec["severity"],
            financial_impact=spec["impact"],
            status=spec["status"],
            assigned_to_id=admin_user.id if spec["status"] == "In Progress" else None,
            description=spec["desc"],
            calculation_explanation=spec["calc"],
            source_records_json=json.dumps({"customer_code": cust.customer_code, "period": "2026-10"}),
            resolved_reason=spec.get("resolved_reason"),
            resolved_by_id=admin_user.id if spec["status"] == "Resolved" else None,
            resolved_at=datetime(2026, 10, 28, 14, 30) if spec["status"] == "Resolved" else None,
            detected_at=datetime(2026, 10, 25, 9, 15) + timedelta(hours=idx),
            is_synthetic_ground_truth=True
        )
        all_exceptions.append(exc)

    db.add_all(all_exceptions)
    db.flush()

    # Add evidence for exceptions
    for exc in all_exceptions:
        ev = ExceptionEvidence(
            exception_id=exc.id,
            evidence_type="Calculation",
            title="System Revenue Audit Finding",
            data_json=json.dumps({
                "explanation": exc.calculation_explanation,
                "impact": float(exc.financial_impact),
                "code": exc.exception_code
            })
        )
        db.add(ev)

        # Add initial note for in-progress or resolved
        if exc.status in ["In Progress", "Resolved"]:
            note = InvestigationNote(
                exception_id=exc.id,
                user_id=admin_user.id,
                note_text="Investigating discrepancy against master contract schedule and ERP logs.",
                created_at=datetime(2026, 10, 26, 11, 0)
            )
            db.add(note)

    # 7. Seed Notifications
    notifications = [
        NotificationEvent(
            title="Revenue Leakage Alert",
            message="Critical pricing mismatch detected on CloudCore Solutions (₹1,20,000 exposure).",
            severity="Critical",
            entity_type="Exception",
            entity_id=all_exceptions[1].id,
            is_read=False,
            created_at=datetime(2026, 10, 26, 10, 30)
        ),
        NotificationEvent(
            title="Underbilling Detected",
            message="TechNova Pvt. Ltd. billed ₹2,40,000 vs expected ₹3,00,000.",
            severity="Warning",
            entity_type="Exception",
            entity_id=all_exceptions[0].id,
            is_read=False,
            created_at=datetime(2026, 10, 27, 8, 15)
        ),
        NotificationEvent(
            title="Reconciliation Completed",
            message="October 2026 contract-to-cash reconciliation completed with 92.4% health score.",
            severity="Info",
            entity_type="Reconciliation",
            entity_id="RUN-202610-001",
            is_read=True,
            created_at=datetime(2026, 10, 28, 9, 0)
        )
    ]
    db.add_all(notifications)

    # 8. Seed Default Settings
    settings_rec = AppSettings(
        key="app_config",
        value_json=json.dumps({
            "workspace_name": "SaaS Revenue Assurance Enterprise",
            "default_currency": "INR",
            "currency_symbol": "₹",
            "timezone": "Asia/Kolkata",
            "underbilling_threshold": 50000.0,
            "overdue_days_alert": 30,
            "ai_provider": "Google Gemini",
            "reduced_motion": False,
            "display_density": "comfortable"
        })
    )
    db.add(settings_rec)

    # 9. Initial Audit Log
    log = AuditLog(
        user_id=admin_user.id,
        action="DATABASE_SEED",
        entity_type="System",
        entity_id="SYSTEM-INIT",
        details="Reproducible synthetic demonstration environment generated with 218 customers and 14 anomalies.",
        created_at=datetime.utcnow()
    )
    db.add(log)

    db.commit()
    print("Database seeding completed successfully!")
    return {
        "status": "success",
        "customers": len(all_customers),
        "contracts": len(all_contracts),
        "invoices": len(all_invoices),
        "exceptions": len(all_exceptions)
    }
