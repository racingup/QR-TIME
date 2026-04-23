#!/bin/sh
# Daily PostgreSQL backup — designed to run inside the `db-backup` container.
#
# Produces /backups/timbreuse-<UTC-stamp>.sql.gz, prunes anything older than
# RETENTION_DAYS (default 30), logs to stdout (Docker captures it).
#
# Required env vars (passed by docker-compose):
#   POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, PGPASSWORD
# Optional:
#   RETENTION_DAYS (default 30)
#
# Restore is in restore.sh — never automated, always operator-driven.
set -eu

: "${POSTGRES_HOST:?missing POSTGRES_HOST}"
: "${POSTGRES_DB:?missing POSTGRES_DB}"
: "${POSTGRES_USER:?missing POSTGRES_USER}"
: "${PGPASSWORD:?missing PGPASSWORD}"

RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_DIR="/backups"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/timbreuse-$STAMP.sql.gz"
TMP="$OUT.partial"

echo "[$(date -u +%FT%TZ)] backup start → $OUT"

# --clean --if-exists makes the dump self-restoring; --no-owner avoids role drift.
pg_dump \
    --host="$POSTGRES_HOST" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=plain \
    --no-owner --no-privileges \
    --clean --if-exists \
  | gzip -9 > "$TMP"

# Atomic rename only on success — partial files never become "the latest backup".
mv "$TMP" "$OUT"

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "[$(date -u +%FT%TZ)] backup ok ($SIZE)"

# Prune old dumps. Use -mtime which is fine on alpine.
PURGED="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'timbreuse-*.sql.gz' \
                -mtime "+$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')"
echo "[$(date -u +%FT%TZ)] pruned $PURGED file(s) older than $RETENTION_DAYS day(s)"

# Touch a heartbeat file — lets external monitoring assert "backup ran today".
date -u +%FT%TZ > "$BACKUP_DIR/.last-success"
