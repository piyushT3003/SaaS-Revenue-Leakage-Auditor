# Phase 11 — AI Investigation Assistant

Status: **implemented and tested in the development workspace.** The optional language-model path is
tested only against a scripted fake provider; it has **not** been run against a live model here
(no API key is configured, and the sandbox cannot reach external APIs).

## Architecture

- `backend/app/ai/tools.py`: **9 read-only, tenant-scoped tools.** Each one has Pydantic-validated arguments and capped row counts:
  - `kpi_snapshot`
  - `leakage_by_category`
  - `leakage_change`
  - `top_underbilled_customers`
  - `margin_customers`
  - `outstanding_invoices`
  - `customer_overview`
  - `exception_detail`
  - `audit_status`

  Every tool returns its rows, the source tables and the metric definition. The tools reuse the same metric functions as the dashboards, so the assistant and the dashboards cannot disagree.
- `backend/app/ai/engine.py`: two planners over the same registry.
  - **Deterministic (default).** Uses intent rules plus entity extraction:
    - month or year ("in September", "last month", but not "vs last month")
    - customer name or code
    - exception code
    - "top N"

    Answers are written from templates using only the tool output.
  - **LLM (optional).** Runs when `LLM_PROVIDER=anthropic`, `LLM_API_KEY` and `LLM_MODEL` are set. The model can call only the registered tools; unknown tools are rejected. Tool output is passed back as data, with a system instruction to ignore instructions inside it. Calls are capped by `ai.max_tool_calls` (default 6). If the provider fails, the deterministic engine answers instead and says so.
- `backend/app/api/ai.py`:
  - `/ai/status`
  - `/ai/ask`
  - `/ai/conversations` (list, read, delete)

  The request session is rolled back before the conversation is logged, and each query is recorded in the audit trail (`AI_QUERY`).
- Migration `0004`: `ai_conversations` and `ai_messages`. Each answer stores its exact tool calls, so every figure is traceable.
- UI (`/ai`) includes:
  - a holographic core with idle / thinking / answered / read-only states
  - suggested questions and a conversation history
  - KPI, table and chart blocks
  - a "How this was calculated" panel listing every query, its arguments, row count, timing, definition and source tables
  - a locked composer for Viewers, who lack `ai:query`

## Guardrails (all tested)

- **No SQL from the model.** Tool names are allow-listed, and arguments are validated. `EX-1'; drop table…` → rejected, and a limit of 10,000 → rejected.
- **Read-only.** Requests to delete, approve, mark or modify records are refused before any tool runs, and the data is checked to be unchanged. This includes an "ignore previous instructions … DROP TABLE" prompt.
- **Grounded figures.** The leakage answer quotes the audit's stored underbilling and its run code. The rows for the top underbilled customers are recomputed from `reconciliation_results` in the test.
- **Privacy.** Conversations belong to the user who created them; other users get 404.
- **No fabricated causes.** The answers separate detected exposure from confirmed causes. Category exposures are explicitly described as overlapping the unique leakage figure.

## Test evidence

- `backend/tests/test_ai_assistant.py`: 10 tests. Full backend suite: **74 passed**.
- Frontend: `tsc` is clean, Vitest 5/5 and the build is OK.
- A browser walkthrough asked these from the Overview prompt and the composer:
  - "Why is revenue leakage up this month?"
  - "Which customers have negative contribution margins?"
  - "Delete invoice …"

## Fixes found during verification

- Page transitions mounted the incoming page twice: once inside the exiting wrapper, once for real. This made `/ai?q=` send the question from a page that was then discarded. `AppLayout` now freezes each page's outlet, which removes the double mount on every page.
- "Break **down** leakage by type" was routed to the "why did leakage go down" intent. Breakdown phrasing is now checked first.
- "Is leakage down **vs last month**" shifted the period to September. Comparison phrasing no longer shifts the period.
- When leakage fell, the explanation said "the increase is driven by". The wording now follows the actual direction, and offsetting categories are listed separately.
