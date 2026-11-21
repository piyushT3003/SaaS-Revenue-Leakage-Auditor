# Performance, accessibility and recovery testing

Measured on 18 Nov 2026 in the development workspace: Linux, Python 3.13, PostgreSQL 16 on the same machine.
Remote databases such as Neon add network latency to every query, so production timings will be higher.

## Performance — `backend/tests/test_performance.py`

The dataset is the full synthetic set: 200 customers and six months of contracts, usage, invoices and payments.
Each endpoint is called three times through the API test client, and the median is reported.

| Operation | Measured | Budget (test fails above) |
|---|---|---|
| Monthly audit (October 2026), engine + exceptions + persistence | **0.95 s** | 60 s |
| `GET /metrics/summary` (KPI cards with comparison period) | 741 ms | 2 s |
| `GET /overview/trend` (six months) | 1,307 ms | 2 s |
| `GET /overview/profitability` | 40 ms | 2 s |
| `GET /exceptions` (50 rows) | 13 ms | 2 s |
| `GET /customers` (50 rows with economics) | 336 ms | 2 s |
| `GET /billing/invoices` (50 rows) | 241 ms | 2 s |
| `GET /metrics/contribution` | 42 ms | 2 s |
| `GET /prioritization` | 77 ms | 2 s |
| `GET /root-cause` | 58 ms | 2 s |

**Observations**
- The trend and summary endpoints are the slowest. They recompute MRR from contract terms for each month in Python. The queries are already eager-loaded, so this is CPU time, not an N+1 problem.
- Caching per audit run would cut that time if the dataset grows well beyond the synthetic one.

**Frontend bundle (production build, gzip)**

| Asset | Size | When it loads |
|---|---|---|
| App shell | 152 kB JS + 11 kB CSS | First visit |
| `three.js` | 271 kB | Only on pages showing a 3D view |
| Each 3D scene | 1–3 kB | Only on its own page |

Not measured: frame rate on real GPUs. The 3D views were checked with software WebGL only.

## Accessibility — `frontend/e2e/accessibility.spec.ts`

**How it was tested**
- The sign-in page and all nine pages were scanned with axe-core against WCAG 2.0 and 2.1, levels A and AA.
- Any **serious** or **critical** violation fails the test.
- WebGL canvases are excluded from the scan. Every 3D view has a text or 2D equivalent on the same page, or a fallback when WebGL is unavailable or reduced motion is set.

**Defects found and fixed**
- **Contrast:** white text on the bright red badges was below 4.5:1. The badges now use the deeper red, `#c81732`.
- **Accessible names that didn't match visible text (WCAG 2.5.3):**
  - the logo link;
  - the health card;
  - the global search button;
  - the account menu;
  - the KPI card links.
- **Hidden but focusable content:**
  - the hidden face of each flip card now uses `inert`;
  - sparkline charts no longer add a keyboard stop.

**Result:** 10 of 10 scans pass. Other accessibility features already in place:
- keyboard focus rings;
- Escape closes drawers and modals;
- the reduced-motion setting is honoured;
- `aria-live` status messages for running audits.

## Recovery

**Interrupted audits** — tests in `backend/tests/test_reconciliation.py`
- An audit left QUEUED or RUNNING for longer than `AUDIT_STALE_MINUTES` (default 15) is marked FAILED with the reason. This happens when the worker stopped, for example on a restart or a serverless freeze.
- The check runs at startup, when audit history is listed, and before every new audit request.
- Because results are written in one transaction, a FAILED run never has partial results.
- The next identical request starts a fresh run instead of reusing the dead one.
- A second test shows that recent runs are left alone.

**Already covered by earlier tests**
- Transient database errors are retried, up to three attempts with backoff.
- Import rollback.
- Completed audits and their results cannot be changed by any database update.
- Corrections void and reissue the invoice, never edit it.
