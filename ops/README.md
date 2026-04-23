# Ops — Backup & Restore Drill

## TL;DR

- **Backup**: runs automatically every night at 02:30 UTC via the `db-backup`
  container (see `docker-compose.prod.yml`). Dumps go to the `pgbackups`
  volume as `timbreuse-<UTC-stamp>.sql.gz`. Retention: 30 days.
- **Restore drill**: once a month the operator runs `ops/restore.sh` on the
  latest dump against a scratch database. If it passes, the backup chain is
  proven. If it fails, that's the whole point of drilling — fix the pipeline
  before you need it.
- **Real disaster restore**: `ops/restore.sh <dump> --target=prod`. Gated
  behind a typed confirmation. Only the operator runs this.

## Monthly drill (required)

On the VPS, from the repo root:

```sh
# pick the latest dump inside the db-backup volume
LATEST=$(docker compose -f docker-compose.prod.yml exec db-backup \
    sh -c 'ls -1t /backups/timbreuse-*.sql.gz | head -1')

# drill: restore into a scratch DB, smoke-check row counts, drop it
ops/restore.sh "$LATEST"
```

Expected output ends with `✓ restore drill passed — dump is usable`.

If the drill fails, do NOT wait for an incident to investigate.

## Offsite copy (recommended)

The `pgbackups` volume lives on the same VPS disk as the database — a disk
failure takes both. Schedule a pull from a separate host (your laptop, another
VPS, Infomaniak Swiss Backup, etc.):

```sh
# run from an external machine, replace VPS_HOST
rsync -avz --delete \
    VPS_HOST:/var/lib/docker/volumes/timbreuse_pgbackups/_data/ \
    ~/offsite/timbreuse-backups/
```

Drop it in the external host's cron, daily, after 03:00 UTC.

## Real incident: restore into prod

```sh
# list what you have
ls -1t /backups/timbreuse-*.sql.gz | head

# restore; the script will ask you to type "RESTORE <db-name>" to confirm
ops/restore.sh /backups/timbreuse-20260422T023000Z.sql.gz --target=prod
```

The script stops `backend`, `celery`, `celery-beat` to freeze writes during
the restore, then restarts them.
