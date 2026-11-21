# Deploy to Vercel + Neon (free tiers)

**What gets deployed:** one Vercel project that runs both the FastAPI backend (as a Vercel Function) and the built React app (served from Vercel's CDN), plus a Neon PostgreSQL database. The repository already contains everything Vercel needs:

| File | Purpose |
|---|---|
| `pyproject.toml` | Python dependencies, the entrypoint `backend.app.main:app`, and CDN promotion of the built frontend |
| `vercel.json` | Build command (`frontend` → `frontend/dist`), function duration, and security headers for the static files |
| `backend/app/main.py` | Serves `frontend/dist` with an `index.html` fallback; unknown `/api/...` paths return a JSON 404 |

**Free-plan limits worth knowing**
- **Vercel Hobby:** for personal, non-commercial use only. Functions can run for up to 300 s; an audit takes about 1 s.
- **Neon free:** the database is permanent, with limited storage and a short restore window.

## 1. Create the database (Neon)

1. In Vercel → **Storage** → **Create** → **Neon** (the Marketplace integration), create a free database and connect it to the project.
2. This adds environment variables to the project, including `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
   - The app prefers `DATABASE_URL_UNPOOLED`, a direct connection that keeps per-connection settings.
   - Both `postgres://` and `postgresql://` forms are accepted.

## 2. Set up the database once, from your laptop

Copy the **unpooled** connection string from Neon, then run this in the project folder (PowerShell, inside the venv):

```powershell
$env:DATABASE_URL = "postgresql://...neon.tech/neondb?sslmode=require"   # the unpooled string
python -m alembic -c backend\alembic.ini upgrade head
```

That creates the schema, the reporting views and the `powerbi_reader` role. Then choose one of these:

**(a) A public portfolio demo** — load the synthetic demo data with a password you choose:

```powershell
python -m backend.app.seed.cli --demo-password "<a strong password>" --run-audits
```

- This creates `piyush@demo.local` (admin), `analyst@demo.local` and `viewer@demo.local`.
- Keep the admin password private.

**(b) A real, empty workspace** — skip seeding. On the first start, the app creates the admin from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, and the **Get started** guide on the Overview walks through the imports.

Then remove the variable: `Remove-Item Env:DATABASE_URL`.

## 3. Project settings in Vercel

Import the GitHub repository. Leave the framework as detected (FastAPI) and the root directory as the repository root. Then add these **Environment Variables** for Production:

**Required**

| Name | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `JWT_SECRET` | 48+ random characters, e.g. `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `CORS_ORIGINS` | `https://<your-project>.vercel.app` |
| `APP_BASE_URL` | `https://<your-project>.vercel.app` |
| `AUTO_MIGRATE` | `false` (migrations run in step 2) |
| `SEED_DEMO_DATA_ON_START` | `false` |
| `AUDIT_EXECUTION` | `inline` (finish audits before responding) |
| `DB_POOL_MODE` | `null` (no connections kept between requests) |

**Optional**

| Name | Value |
|---|---|
| `DEMO_LOGIN_EMAIL` | `viewer@demo.local` — adds a **View the demo (read-only)** button. The server refuses any account that is not a VIEWER, and the demo account's password cannot be changed |
| `DEMO_AUTO_LOGIN` | `true` — **demo mode**: visitors open the read-only demo straight away, without signing in. A banner offers "Sign in with your account"; `/?signin` always shows the sign-in form |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Only for option (b) |
| `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `EMAIL_FROM` | Turns on self-service "Forgot password" and alert emails (failed audits, new high-severity exceptions; on/off in Settings → Alerts). The Brevo free plan sends 300 emails a day. Without it, admins issue one-time reset links |
| `CRON_SECRET` | 32+ random characters. Turns on the daily job (`vercel.json` → `crons`, 21:30 UTC = 03:00 IST): it audits last month once it has closed and prunes expired records. Vercel sends the secret automatically |
| `SENTRY_DSN`, `SENTRY_FRONTEND_DSN` | Sentry error monitoring for the API and the browser (free Developer plan). Browser reports go through the app's own `/api` tunnel, so the CSP stays `'self'` |
| `OPERATOR_NAME`, `CONTACT_EMAIL` | Shown on the public `/privacy` and `/terms` pages |

Deploy. The build runs `npm ci && npm run build` in `frontend/`. Vercel installs the Python dependencies from `pyproject.toml`.

## 4. Check the deployment

| Check | Expected |
|---|---|
| `https://<project>.vercel.app/api/health/ready` | `{"status":"ready","schema_revision":"0006"}` |
| Sign in | Works |
| Reload on `/customers` | The app loads (SPA fallback) |
| Run Audit | Completes and shows the result straight away (inline mode) |
| Browser dev tools → Network | No CSP errors |

## Monitoring and backups

- **Uptime.** Create a free UptimeRobot (or similar) HTTP monitor on `https://<project>.vercel.app/api/health/ready`, every 5 minutes, with email alerts. That endpoint fails if the database is unreachable.
- **Errors.** With the Sentry variables set, unhandled API errors and browser errors appear in Sentry, with cookies, headers and request bodies removed.
- **Backups.** Add the `BACKUP_DATABASE_URL` and `BACKUP_PASSPHRASE` repository secrets in GitHub; see `docs/operations/BACKUP_AND_RESTORE.md`.

## Things to verify on the first deploy

These could not be tested from the development environment:
1. **Static files.** Vercel promotes `frontend/dist` to the CDN, and `vercel.json` adds the security headers. If the CDN promotion is skipped, the app still works: the function serves the files and adds the same headers.
2. **Power BI role.** Neon must allow creating the `powerbi_reader` role through SQL. If it doesn't, create a read-only role in the Neon console and grant it `SELECT` on schema `reporting`.
3. **Cold starts.** The first request after an idle period takes a few seconds while Python and pandas load.

## Updating

Push to the default branch and Vercel redeploys. If a release adds a migration, run step 2's `alembic upgrade head` against Neon **before** pushing.
