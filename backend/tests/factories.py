"""Small ORM factories for deterministic financial fixtures."""
from __future__ import annotations

from datetime import date
from decimal import Decimal as Dec

from sqlalchemy.orm import Session

from backend.app.models import (
    Contract,
    ContractVersion,
    CreditAdjustment,
    Customer,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    PricingRule,
    Product,
    ProductCost,
    Subscription,
    UsageBatch,
    UsageEvent,
)


class World:
    """Builds a minimal, fully specified billing world inside one tenant."""

    def __init__(self, db: Session, tenant_id: int):
        self.db, self.t = db, tenant_id
        self.products: dict[str, Product] = {}

    def product(self, code="P-CORE", model="RECURRING") -> Product:
        if code not in self.products:
            p = Product(tenant_id=self.t, product_code=code, name=code, charge_model=model)
            self.db.add(p)
            self.db.flush()
            self.products[code] = p
        return self.products[code]

    def customer(self, code="C-1", segment="ENTERPRISE") -> Customer:
        c = Customer(tenant_id=self.t, customer_code=code, name=f"Customer {code}", segment=segment)
        self.db.add(c)
        self.db.flush()
        return c

    def contract(self, customer: Customer, number="CTR-1", start=date(2026, 1, 1), currency="INR") -> Contract:
        c = Contract(tenant_id=self.t, contract_number=number, customer_id=customer.id, start_date=start, currency=currency)
        self.db.add(c)
        self.db.flush()
        return c

    def version(self, contract: Contract, n=1, start=date(2026, 1, 1), end=None) -> ContractVersion:
        v = ContractVersion(tenant_id=self.t, contract_id=contract.id, version_number=n, effective_from=start, effective_to=end)
        self.db.add(v)
        self.db.flush()
        return v

    def rule(self, version: ContractVersion, product: Product, price, charge="RECURRING", model="PER_UNIT", key=None,
             discount="0", included="0", tiers=None) -> PricingRule:
        r = PricingRule(tenant_id=self.t, rule_key=key or f"R-{version.id}-{product.product_code}", rule_version=1,
                        contract_version_id=version.id, product_id=product.id, charge_type=charge, pricing_model=model,
                        unit_price=Dec(str(price)), discount_pct=Dec(discount), included_units=Dec(included), tiers=tiers or [])
        self.db.add(r)
        self.db.flush()
        return r

    def subscription(self, customer, contract, product, qty="1", code="S-1", start=date(2026, 1, 1), end=None,
                     freq="MONTHLY") -> Subscription:
        s = Subscription(tenant_id=self.t, subscription_code=code, customer_id=customer.id, contract_id=contract.id,
                         product_id=product.id, quantity=Dec(qty), start_date=start, end_date=end, billing_frequency=freq)
        self.db.add(s)
        self.db.flush()
        return s

    def invoice(self, customer, number="INV-1", issue=date(2026, 10, 31), total=None, status="ISSUED", due=None) -> Invoice:
        inv = Invoice(tenant_id=self.t, invoice_number=number, customer_id=customer.id, issue_date=issue,
                      due_date=due or issue, status=status, subtotal=Dec(str(total or 0)), total_amount=Dec(str(total or 0)))
        self.db.add(inv)
        self.db.flush()
        return inv

    def line(self, invoice, sub: Subscription | None, amount, qty="1", price=None, charge="RECURRING", n=None,
             period=(date(2026, 10, 1), date(2026, 10, 31)), product=None, discount_pct="0", ref=None) -> InvoiceLine:
        n = n or (len(invoice.lines) + 1 if invoice.lines else 1)
        ln = InvoiceLine(tenant_id=self.t, invoice_id=invoice.id, line_number=n, subscription_id=sub.id if sub else None,
                         product_id=(product.id if product else (sub.product_id if sub else None)), charge_type=charge,
                         period_start=period[0], period_end=period[1], quantity=Dec(str(qty)),
                         unit_price=Dec(str(price if price is not None else amount)), discount_pct=Dec(discount_pct),
                         line_amount=Dec(str(amount)), billing_obligation_ref=ref)
        self.db.add(ln)
        self.db.flush()
        self.db.refresh(invoice)
        return ln

    def payment(self, customer, number="PAY-1", amount="0", received=date(2026, 10, 15), ref="", remit="") -> Payment:
        p = Payment(tenant_id=self.t, payment_number=number, customer_id=customer.id if customer else None, received_on=received,
                    amount=Dec(str(amount)), transaction_reference=ref, remittance_invoice_ref=remit)
        self.db.add(p)
        self.db.flush()
        return p

    def allocate(self, payment, invoice, amount, on=date(2026, 10, 15)) -> PaymentAllocation:
        a = PaymentAllocation(tenant_id=self.t, payment_id=payment.id, invoice_id=invoice.id, amount=Dec(str(amount)), allocated_on=on)
        self.db.add(a)
        self.db.flush()
        return a

    def credit(self, customer, invoice, amount, number="CN-1", on=date(2026, 10, 20), status="APPROVED") -> CreditAdjustment:
        c = CreditAdjustment(tenant_id=self.t, credit_number=number, customer_id=customer.id, invoice_id=invoice.id if invoice else None,
                             adjustment_type="CREDIT_NOTE", amount=Dec(str(amount)), reason="test", status=status, effective_date=on)
        self.db.add(c)
        self.db.flush()
        return c

    def cost(self, product, amount, customer=None, month=date(2026, 10, 1), cost_type="SUPPORT", basis="DIRECT") -> ProductCost:
        c = ProductCost(tenant_id=self.t, product_id=product.id, customer_id=customer.id if customer else None, period_month=month,
                        cost_type=cost_type, amount=Dec(str(amount)), allocation_basis=basis)
        self.db.add(c)
        self.db.flush()
        return c

    def usage_batch(self, code="UB-1", start=date(2026, 10, 1), end=date(2026, 10, 31), control=None, status="PROCESSED") -> UsageBatch:
        b = UsageBatch(tenant_id=self.t, batch_code=code, period_start=start, period_end=end, control_event_count=control, status=status)
        self.db.add(b)
        self.db.flush()
        return b

    def usage(self, sub: Subscription, when, qty, event_id, batch=None) -> UsageEvent:
        e = UsageEvent(tenant_id=self.t, event_id=event_id, subscription_id=sub.id, customer_id=sub.customer_id,
                       product_id=sub.product_id, occurred_at=when, quantity=Dec(str(qty)), usage_batch_id=batch.id if batch else None)
        self.db.add(e)
        self.db.flush()
        return e

    def simple_recurring(self, code="C-1", price="10000", qty="1", discount="0"):
        """One customer, one contract/version/rule, one monthly subscription."""
        p = self.product()
        c = self.customer(code)
        ctr = self.contract(c, f"CTR-{code}")
        v = self.version(ctr)
        self.rule(v, p, price, discount=discount)
        s = self.subscription(c, ctr, p, qty=qty, code=f"S-{code}")
        return c, ctr, v, s
