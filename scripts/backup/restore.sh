#!/usr/bin/env bash
# Restore an encrypted backup into an EMPTY database (never over production by accident).
#   ./restore.sh sra-<timestamp>.dump.gpg
#   TARGET_DATABASE_URL  postgres:// URL of an empty database (for example a new Neon branch)
#   BACKUP_PASSPHRASE    the passphrase used by backup.sh
set -euo pipefail
file="${1:?usage: restore.sh <backup.dump.gpg>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"
PSQL="${PSQL:-psql}"
url="${TARGET_DATABASE_URL/postgresql+psycopg:/postgresql:}"
if [ -f "$file.sha256" ]; then sha256sum -c "$file.sha256"; fi
tables=$($PSQL "$url" -tAc "select count(*) from information_schema.tables where table_schema='public'")
if [ "$tables" != "0" ]; then
  echo "Refusing to restore: the target database already has $tables tables. Use an empty database." >&2
  exit 1
fi
gpg --batch --decrypt --passphrase-fd 3 "$file" 3<<<"$BACKUP_PASSPHRASE" \
  | $PG_RESTORE --no-owner --no-privileges --exit-on-error --dbname="$url"
echo "Restored. Schema revision: $($PSQL "$url" -tAc 'select version_num from alembic_version')"
