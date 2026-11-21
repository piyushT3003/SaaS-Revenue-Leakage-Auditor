# Security review

Scope: backend API, frontend SPA, database layer, reporting layer, AI assistant, and container and proxy configuration.
Method: code review against OWASP ASVS L2 and the OWASP Top 10 (2021), automated dependency audits, and executable tests.
Date: 16 Nov 2026.

> **This is an internal engineering review, not a penetration test or certification.**
> - **Not done:** no external pen test and no load or DoS test were performed.
> - **Not run here:** the nginx configuration could not be executed in the build sandbox. Its CSP was verified by serving the production build with the identical header.

## Summary

| Area | Result |
|---|---|
| Dependency vulnerabilities | `npm audit`: 0 (prod and dev). `pip-audit -r backend/requirements.txt`: 0 known |
| Hard-coded secrets | None found (scan of `backend/app`, `frontend/src`). `JWT_SECRET` is required in production; the bootstrap admin password is generated once and printed to the server console only |
| SQL injection | All queries go through the SQLAlchemy ORM or bound `text()` parameters. One f-string (`SET statement_timeout`) interpolates an `int()`-cast setting, which is safe |
| AuthN | bcrypt password hashes. JWT in an `httpOnly`, `SameSite=Strict` cookie (asserted by E2E). Server-side session table allows revocation on logout. Login throttling |
| AuthZ | Role-permission matrix enforced per endpoint (`require(...)`). Tenant scoping on every query. Segregation of duties for credit approvals and billing-rule approvals (submitter ≠ approver) |
| Financial integrity | DB triggers make results and the audit log append-only; finalized audits are immutable. Corrections are append-only (void + reissue, allocation reversal) |
| AI assistant | Allow-listed, read-only, tenant-scoped tools with Pydantic-validated arguments. No model-generated SQL. Write intents are refused. The session is rolled back before logging. Tool output is passed to the LLM as data |
| Reporting layer | `powerbi_reader` role: `SELECT` on schema `reporting` only, `NOLOGIN` until an admin sets a password. Tests prove it cannot read `public.*` or write |

## Findings fixed in this review

| # | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| S-1 | Medium | No HTTP security headers on API or SPA (clickjacking, MIME sniffing, no CSP) | API middleware: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, a CSP (`default-src 'none'` for JSON, scoped CSP for `/docs`), `Cache-Control: no-store` on all `/api/` responses, and HSTS in production. nginx sends the same headers plus an SPA CSP with no third-party origins | `test_security_headers_on_api_and_docs`. The production build was served under the nginx CSP and login, AI page, WebGL scenes and the 3D graph were exercised with **0 CSP violations** |
| S-2 | Medium | Spreadsheet formula injection (CWE-1236): imported names and notes were written raw into XLSX exports | `exports/safe.py` prefixes text starting with `= + - @ \t \r \n` (except numeric strings). Applied to the executive report, evidence packs and simulation exports | `test_spreadsheet_exports_neutralise_formula_injection` |
| S-3 | Low | Logout left the previous session's data cached in the SPA (query cache cleared in the wrong order), so the authenticated UI stayed visible after the session ended | Mark the session null first, then drop all other cached responses | E2E `auth.spec.ts` (signs out → protected route shows sign-in) |
| S-4 | Low | nginx: `add_header` inside `location` blocks would have silently dropped server-level security headers | Cache policy moved to `expires`, with a comment warning against `add_header` in locations | Config review |
| S-5 | Info | Profile menu button had no accessible name | `aria-label="Account menu"` | E2E uses it |

## Residual risks and recommendations (not fixed)

1. **TLS.** HSTS is emitted only when `ENVIRONMENT=production`. Terminate TLS at the proxy and uncomment HSTS in `nginx.conf`.
2. **Login throttling is per process.** It is in-memory, so with several API workers the attempt counts are split. Use a shared store (Redis) or a proxy rate limit (`limit_req`) in production.
3. **Style CSP.** It allows `'unsafe-inline'` because the animation libraries set inline `style` attributes. Scripts remain same-origin only.
4. **LLM provider.** When enabled, question text and tool results (customer names, amounts) are sent to the configured provider. Review the data-processing terms before enabling it, and keep the default deterministic engine where that isn't acceptable.
5. **Secrets management.** Use a secrets manager or Docker secrets rather than `.env` files in production. Rotate `JWT_SECRET`, which invalidates all sessions.
6. **Backups and PITR.** Database backup and restore is not part of this repository.
7. **Audit-log retention and exporting the logs to a SIEM** are not implemented.
