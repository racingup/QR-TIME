#!/bin/sh
# Restore a dump into a scratch database to prove the backup is good.
#
# Usage (from the VPS, from the repo root):
#   ops/restore.sh <path-to-dump.sql.gz> [--target=scratch|prod]
#
# Default target is `scratch` — creates a throwaway DB named timbreuse_restore_test
# inside the existing `db` container, loads the dump, runs a smoke check
# (row counts on key tables), drops the DB. Proves the dump is restorable
# without touching production data.
#
# --target=prod is GATED. It asks for an interactive confirmation, then restores
# into ${POSTGRES_DB} inside the live `db` container. Only the operator runs
# this, only after a real incident.
set -eu

DUMP="${1:-}"
TARGET="${2:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
    echo "usage: $0 <dump.sql.gz> [--target=scratch|prod]" >&2
    echo "available dumps:" >&2
    ls -1t /backups/timbreuse-*.sql.gz 2>/dev/null | head -10 >&2 || true
    exit 2
fi

COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"

load_env() {
    # Read the single variable from the running container — avoids requiring
    # .env.production on the operator's shell.
    $COMPOSE exec -T "$DB_SERVICE" sh -c "echo \$$1"
}

PG_USER="$(load_env POSTGRES_USER)"
PG_DB="$(load_env POSTGRES_DB)"

case "$TARGET" in
    ""|--target=scratch)
        SCRATCH="timbreuse_restore_test"
        echo "→ scratch restore into database '$SCRATCH' (prod DB untouched)"
        $COMPOSE exec -T "$DB_SERVICE" psql -U "$PG_USER" -d postgres \
            -c "DROP DATABASE IF EXISTS $SCRATCH;" \
            -c "CREATE DATABASE $SCRATCH;"
        gunzip -c "$DUMP" | $COMPOSE exec -T "$DB_SERVICE" \
            psql -U "$PG_USER" -d "$SCRATCH" -v ON_ERROR_STOP=1 > /dev/null
        echo "→ smoke check:"
        $COMPOSE exec -T "$DB_SERVICE" psql -U "$PG_USER" -d "$SCRATCH" -At <<'SQL'
SELECT 'users_userprofile=' || count(*) FROM users_userprofile;
SELECT 'clocking_clocksession=' || count(*) FROM clocking_clocksession;
SELECT 'missions_mission=' || count(*) FROM missions_mission;
SELECT 'users_adminauditlog=' || count(*) FROM users_adminauditlog;
SQL
        $COMPOSE exec -T "$DB_SERVICE" psql -U "$PG_USER" -d postgres \
            -c "DROP DATABASE $SCRATCH;" > /dev/null
        echo "✓ restore drill passed — dump is usable"
        ;;
    --target=prod)
        echo "‼  DESTRUCTIVE: this overwrites the live '$PG_DB' database."
        printf "  type 'RESTORE %s' to proceed: " "$PG_DB"
        read -r CONFIRM
        if [ "$CONFIRM" != "RESTORE $PG_DB" ]; then
            echo "aborted." >&2
            exit 1
        fi
        echo "→ stopping backend + celery to freeze writes..."
        $COMPOSE stop backend celery celery-beat
        gunzip -c "$DUMP" | $COMPOSE exec -T "$DB_SERVICE" \
            psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1
        echo "→ restarting app..."
        $COMPOSE up -d backend celery celery-beat
        echo "✓ prod restore complete"
        ;;
    *)
        echo "unknown target: $TARGET" >&2
        exit 2
        ;;
esac
