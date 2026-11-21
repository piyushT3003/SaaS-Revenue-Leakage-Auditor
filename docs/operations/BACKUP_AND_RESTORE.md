# Backup and restore

## What is backed up

- **Schedule.** `.github/workflows/backup.yml` runs every Sunday at 21:17 UTC (Monday 02:47 IST). You can also start it by hand from the Actions tab with **Run workflow**.
- **Method.** `scripts/backup/backup.sh` takes a full logical dump of the database (`pg_dump --format=custom`) and encrypts it with AES-256 (GnuPG, symmetric passphrase) **before** it leaves the runner.
- **Storage.** The `.dump.gpg` file and its SHA-256 checksum are kept as a workflow artifact for 30 days.
- **Check.** Every run proves that the backup decrypts and that `pg_restore` can read it. The number of tables with data is printed in the log.
- **Why encrypt.** Workflow artifacts of a public repository can be downloaded by other GitHub users, so an unencrypted dump would expose the data.
- **Neon's own protection.** Neon's free plan also allows a short point-in-time restore window. These backups are independent of Neon.

## One-time setup

1. Generate a passphrase:

   ```
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   Store it in your password manager. **Without it, no backup can be restored.**
2. In GitHub → repository → **Settings → Secrets and variables → Actions**, add two secrets:
   - `BACKUP_DATABASE_URL`: the **direct (unpooled)** Neon connection string.
   - `BACKUP_PASSPHRASE`: the passphrase from step 1.
3. Run the workflow once by hand and check that it is green.

If the secrets are missing, the workflow skips the backup with a warning instead of failing.

## Restore

**Always restore into an empty database**, for example a new Neon branch or a new database. `restore.sh` refuses any database that already has tables, so production cannot be overwritten by accident.

1. Download the artifact from the workflow run and unzip it. You get `sra-<timestamp>.dump.gpg` and `.sha256`.
2. Create an empty target database (Neon console → **Branches → Create branch** from an empty state, or a new database). Copy its direct connection string.
3. Run (Linux, macOS, WSL or Git Bash, with PostgreSQL client tools at least as new as the server):

   ```bash
   export TARGET_DATABASE_URL='postgresql://…'   # the empty target
   export BACKUP_PASSPHRASE='…'
   scripts/backup/restore.sh sra-<timestamp>.dump.gpg
   ```

   The script:
   - checks the checksum;
   - decrypts the file;
   - restores it;
   - prints the schema revision.

   A wrong passphrase fails at decryption, and nothing is written.
4. Re-apply the Power BI read-only grants. Dumps exclude roles and privileges, because those are cluster-wide:

   ```sql
   GRANT USAGE ON SCHEMA reporting TO powerbi_reader;
   GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO powerbi_reader;
   ```

5. Point the app at the restored database: change `DATABASE_URL` / `DATABASE_URL_UNPOOLED` in Vercel and redeploy. Check that `/api/health/ready` reports the expected schema revision.

## Restore test (evidence)

**When:** 22 Nov 2026, in the development environment, using the full synthetic dataset.

**Backup and restore**
- `backup.sh` produced a 1.9 MB encrypted file (AES256.CFB).
- `restore.sh` restored it into an empty database.
- The restored database reports schema revision `0006`.

**Rows compared between source and restored database**

| Table | Rows |
|---|---|
| customers | 200 = 200 |
| invoices | 1,062 = 1,062 |
| reconciliation_results | 3,218 = 3,218 |
| exceptions | 32 = 32 |
| audit_runs | 6 = 6 |

**Safety checks**
- Restoring into a database that already has tables was refused.
- A wrong passphrase failed at decryption ("Bad session key").

Repeat this test after any change to the schema, and at least every quarter.
