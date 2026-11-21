"""Import every model so ``Base.metadata`` is complete (Alembic autogenerate relies on this)."""
from backend.app.models.base import Base  # noqa: F401
from backend.app.models.identity import (  # noqa: F401
    AuditLog, LoginAttempt, Notification, PasswordResetToken, Role, Tenant, TenantSetting, User, UserSession,
)
from backend.app.models.imports import ImportBatch, ImportRow  # noqa: F401
from backend.app.models.reference import (  # noqa: F401
    Contract,
    ContractVersion,
    Customer,
    PricingRule,
    Product,
    ProductCost,
    Subscription,
)
from backend.app.models.transactions import (  # noqa: F401
    CreditAdjustment,
    Invoice,
    InvoiceLine,
    InvoiceLineAllocation,
    Payment,
    PaymentAllocation,
    UsageBatch,
    UsageEvent,
)
from backend.app.models.audit import (  # noqa: F401
    AuditRun,
    BillingObligation,
    BillingObligationComponent,
    Job,
    PaymentReconciliationResult,
    ReconciliationResult,
)
from backend.app.models.investigation import (  # noqa: F401
    EvidencePack,
    ExceptionCase,
    ExceptionEvidence,
    ExceptionStatusHistory,
    InvestigationNote,
    RegressionTestResult,
    RegressionTestSuite,
    RootCauseInvestigation,
    SimulationResult,
    SimulationScenario,
    SyntheticGroundTruth,
)
from backend.app.models.ai import AIConversation, AIMessage  # noqa: F401,E402
