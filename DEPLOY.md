# Production Deployment Guide

> This doc covers **project preparation only** — not VPS provisioning.  
> Assumes you have a VPS with Docker installed and SSH access.

---

## Architecture overview

```
Your machine  ──git push──▶  GitHub/GitLab
                                  │
                          (tests pass on CI)
                                  │
                             SSH + deploy.sh
                                  ▼
                          ┌──────────────────┐
                          │  Caddy (443/80)  │ ← TLS auto (Let's Encrypt)
                          │   ├ /api/*  ──▶  backend:8000 (Gunicorn)
                          │   ├ /admin/* ──▶  backend:8000
                          │   └ /*      ──▶  frontend:80  (nginx + React SPA)
                          ├── PostgreSQL 16  (not exposed publicly)
                          ├── Redis 7        (not exposed publicly)
                          ├── Celery worker  (background jobs)
                          └── Celery beat    (scheduled tasks: 20h purge, etc.)
                          └──────────────────┘
```

All services run via `docker-compose.prod.yml`. A single `deploy.sh` script handles the full lifecycle.

---

## Step 1 — Create the production env file

This is the **most important step**. Everything sensitive lives here. This file must **never be committed to git**.

On your VPS, inside the project folder:

```bash
cp .env.production.example .env.production
chmod 600 .env.production   # only readable by current user
nano .env.production
```

Fill in every value:

| Variable | How to set it |
|---|---|
| `DOMAIN` | Your domain, no `https://` — e.g. `timbreuse.mycompany.com` |
| `LETSENCRYPT_EMAIL` | Your email (for TLS cert expiry alerts) |
| `DJANGO_SECRET_KEY` | Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `POSTGRES_DB` | e.g. `timbreuse` |
| `POSTGRES_USER` | e.g. `timbreuse` |
| `POSTGRES_PASSWORD` | Strong random password — generate same as above |
| `REDIS_URL` | Leave as `redis://redis:6379/0` (internal Docker network) |
| `EMAIL_HOST` | SMTP host (e.g. `smtp.infomaniak.com`) |
| `EMAIL_HOST_USER` | Your SMTP username |
| `EMAIL_HOST_PASSWORD` | Your SMTP password |
| `DEFAULT_FROM_EMAIL` | e.g. `QRtime <no-reply@mycompany.com>` |
| `SITE_PUBLIC_URL` | e.g. `https://timbreuse.mycompany.com` |
| `INITIAL_SUPERUSER_USERNAME` | First admin account username |
| `INITIAL_SUPERUSER_PASSWORD` | First admin account password (strong) |
| `INITIAL_SUPERUSER_EMAIL` | First admin email |
| `RETENTION_TIME_DATA_YEARS` | `5` (default, compliant with Swiss law) |
| `RETENTION_AUDIT_LOG_YEARS` | `10` (default, compliant with Swiss law) |

> **DNS prerequisite**: your `DOMAIN` must already point to the VPS IP before deploying. Caddy needs to validate the domain to issue a TLS certificate.

---

## Step 2 — Verify the project runs tests cleanly

Before deploying, run tests locally to confirm nothing is broken:

```bash
# Backend (152 tests)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 manage.py test

# Frontend (17 tests)
cd frontend
npm install
npm test
```

Both must pass with **0 failures** before going to production.

---

## Step 3 — Deploy

On the VPS, from the project root:

```bash
./deploy/deploy.sh
```

This script:
1. Pulls the latest code from git
2. Builds all Docker images
3. Runs `collectstatic` and DB migrations inside the backend container
4. Creates the initial superuser (using `INITIAL_SUPERUSER_*` from `.env.production`)
5. Starts all services with `docker-compose.prod.yml`

First-time TLS certificate issuance by Caddy takes ~30–60 seconds.

**Verify everything is up:**

```bash
# All containers should be "running" or "healthy"
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# Health check
curl https://your-domain.com/api/health/
# Expected: {"status": "ok", "time": "..."}

# Django admin
# Open https://your-domain.com/admin/ in browser
```

---

## Step 4 — Secure after first deploy

Once the admin account is created, **wipe `INITIAL_SUPERUSER_*`** from `.env.production` so they don't stay in the file:

```bash
nano .env.production   # set INITIAL_SUPERUSER_USERNAME, _PASSWORD, _EMAIL to empty
docker compose -f docker-compose.prod.yml --env-file .env.production restart backend
```

Then log in to `/admin/` and change the admin password to something long and unique.

---

## Step 5 — Add employees

From `/admin/` (Django admin), create user accounts:

| Field | Notes |
|---|---|
| `username` | Employee login |
| `password` | Set a temporary password, ask them to change it |
| `is_manager` | Check for managers |
| `is_mission_manager` | Check for mission supervisors |
| `home_site` | Assign the employee's work location |
| `weekly_target_hours` | e.g. `42` for full-time, `21` for half-time |
| `vacation_quota` | Number of vacation days per year |

Also from `/admin/`, create the **Site** for your office:
- Name, latitude/longitude, GPS radius (meters), and the QR token (auto-generated)

Print the site QR from `/admin/sites/{id}/qr` in the app.

---

## Daily operations (cheat sheet)

All commands run on the VPS inside the project folder:

```bash
# View logs
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f celery

# Restart a service
docker compose -f docker-compose.prod.yml --env-file .env.production restart backend

# Django management shell
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend python manage.py shell

# Run a manual data purge (LPD retention)
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend python manage.py purge_old_data --dry-run

# Manual DB backup
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T db pg_dump -U timbreuse timbreuse | gzip > backup-$(date +%F).sql.gz
```

> Automatic backups run nightly at 02:30 UTC via the `db-backup` container.  
> See [ops/README.md](ops/README.md) for the monthly restore drill procedure.

---

## Updating the app (re-deploy)

```bash
cd /opt/timbreuse     # or wherever you cloned the repo on the VPS
git pull
./deploy/deploy.sh
```

The script is safe to re-run — it will rebuild only what changed, apply new migrations, and restart services.

---

## Rollback

If a deploy breaks production:

```bash
git log --oneline -10          # find the last good commit
git reset --hard <sha>
./deploy/deploy.sh
```

For a broken DB migration — restore from the automatic nightly backup:

```bash
# List available backups
ls -1t /backups/timbreuse-*.sql.gz | head

# Restore (will ask for confirmation)
ops/restore.sh /backups/timbreuse-<date>.sql.gz --target=prod
```

---

## Pre-launch security checklist

- [ ] `DJANGO_SECRET_KEY` is unique and **never committed to git**
- [ ] `DJANGO_DEBUG` is `0` in prod (enforced by `docker-compose.prod.yml`)
- [ ] `DJANGO_ALLOWED_HOSTS` is set to your domain only
- [ ] `CORS_ALLOWED_ORIGINS` is set to `https://your-domain` only
- [ ] `POSTGRES_PASSWORD` is strong and never committed
- [ ] `INITIAL_SUPERUSER_*` values cleared after first deploy
- [ ] Admin password changed after first login
- [ ] `SKIP_SEED` is NOT needed in prod (seed_demo doesn't run without explicit call)
- [ ] HTTPS works: `curl -I https://your-domain.com/api/health/` returns `200`
- [ ] TLS grade: check with [SSL Labs](https://www.ssllabs.com/ssltest/) (should be A or A+)
- [ ] DB and Redis are NOT accessible from outside Docker (no public port bindings in prod compose)
- [ ] Automatic nightly DB backup is working — verify a dump exists in the `pgbackups` volume
- [ ] You receive Let's Encrypt emails at `LETSENCRYPT_EMAIL` (means TLS is working)
- [ ] Privacy policy updated with your real company name, address, and DPO email

---

## Scheduled tasks (automatic — no action needed)

| Time | Task | Effect |
|---|---|---|
| Every day 20:00 (Europe/Paris) | `detect_forgotten_clockouts` | Marks unclosed sessions, creates alerts for managers |
| Every Sunday 03:00 (Europe/Paris) | `purge_old_data` | Deletes data older than retention window (5y / 10y audit) |
| Every day 02:30 UTC | `db-backup` container | PostgreSQL dump → `pgbackups` volume, 30-day retention |
