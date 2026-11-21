// Power Query (M) — reporting.fact_exception
// Create Text parameters PgServer (e.g. "localhost:5432") and PgDatabase (e.g. "sra").
// Credentials: Database → the read-only role powerbi_reader. Privacy level: Organizational.
let
    Source     = PostgreSQL.Database(PgServer, PgDatabase),
    Table      = Source{[Schema = "reporting", Item = "fact_exception"]}[Data],
    // Money stays Fixed Decimal (Currency.Type), never Double, so totals match the application to the paisa.
    MoneyCols  = List.Intersect({ Table.ColumnNames(Table), {
                    "expected_amount", "invoiced_amount", "variance", "underbilled_amount", "overbilled_amount",
                    "expected_total", "invoiced_total", "variance_total", "underbilled_total", "overbilled_total",
                    "invoice_total", "credits_applied", "payments_allocated", "outstanding", "payment_amount", "unallocated_amount",
                    "financial_impact", "unit_price", "discount_amount", "line_amount", "amount", "allocated_amount",
                    "net_revenue", "direct_cost", "contribution", "revenue" } }),
    Typed      = Table.TransformColumnTypes(Table, List.Transform(MoneyCols, each { _, Currency.Type }))
in
    Typed
