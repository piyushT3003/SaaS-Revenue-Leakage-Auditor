#!/usr/bin/env bash
# Encrypted logical backup of the production database.
#   DATABASE_URL       direct (unpooled) postgres:// URL of the database to back up
#   BACKUP_PASSPHRASE  long random passphrase; without it the backup cannot be restored
# Output: sra-<UTC timestamp>.dump.gpg (pg_dump custom format, AES-256 encrypted) + its .sha256
# The pg_dump client must be at least as new as the server (the workflow uses the postgres:17 image).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
PG_DUMP="${PG_DUMP:-pg_dump}"
url="${DATABASE_URL/postgresql+psycopg:/postgresql:}"   # libpq does not understand the SQLAlchemy driver prefix
out="sra-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
umask 077
$PG_DUMP --format=custom --no-owner --no-privileges --dbname="$url" \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$out" 3<<<"$BACKUP_PASSPHRASE"
sha256sum "$out" > "$out.sha256"
echo "$out"
