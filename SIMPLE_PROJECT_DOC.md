# Timbreuse — Simple Project Doc

## 1) What this project is

Timbreuse (QRtime.ch) is a **work time tracking platform**.

Employees clock in/out by scanning a **QR code**, and the app checks their **GPS location**.

It also includes:
- mission management
- absence requests
- manager approvals
- admin settings
- audit + data retention features

---

## 2) Main parts of the repository

- `backend/` → Django REST API + business logic + Celery jobs
- `frontend/` → React web app used by employees/managers/admins
- `site_web_vitrine/` → Astro marketing website (public landing page)
- `docker-compose.yml` → runs full local stack (DB + Redis + backend + worker + frontend)
- `ops/` → backup / restore scripts

---

## 3) Tech stack (simple)

### Backend
- Django 4.2 + Django REST Framework
- JWT authentication (`login`, `refresh`, `logout`)
- PostgreSQL database
- Redis cache/broker
- Celery background jobs

### Frontend
- React (Vite)
- React Router
- Tailwind CSS
- QR scanner via `html5-qrcode`
- Map/location tools via Leaflet

### Infrastructure
- Docker / Docker Compose
- Caddy / Nginx config files included

---

## 4) User roles

- **Employee**: scan QR, see dashboard/history, request mission/absence
- **Manager**: approve/reject requests, monitor team
- **Mission manager**: mission-specific administration
- **Superuser/Admin**: global settings, site QR generation, advanced controls

---

## 5) Main backend domains

- `apps/users` → users, authentication, profile, privacy actions
- `apps/clocking` → scan flow, sessions, history, regularization
- `apps/missions` → create/approve/reject missions + mission QR
- `apps/absences` → create/approve/reject absences
- `services/` → core business calculations (geo, overtime, rounding, reports, QR)

---

## 6) Important business rules

- QR scan is validated with **GPS distance** from allowed site
- Site QR can be rotated and audited
- Mission QR is linked to employee + mission date window
- Time rounding and overtime are handled in backend services
- Managers cannot self-approve their own requests (superuser can)
- Forgotten clock-outs are auto-detected by a scheduled Celery task

---

## 7) API structure (high level)

- `/api/auth/*` → authentication
- `/api/me/*` → personal data/summary/consent/export
- `/api/clock/*` → clock scans, day/history sessions
- `/api/missions/*` → mission flows
- `/api/absences/*` → absence flows
- `/api/manager/*` and `/api/admin/*` → manager/admin operations
- `/api/health/` → health check endpoint

---

## 8) Frontend routes (high level)

- `/login` (public)
- `/privacy` (public)
- authenticated app routes such as:
  - `/scan`
  - `/dashboard`
  - `/calendar`
  - `/requests`
  - `/manager` (manager+)
  - `/mission-gestion` (mission manager+)
  - `/admin` (superuser only)

---

## 9) Quick local start

Run everything with Docker Compose:

1. Build and start services
2. Open frontend on `http://localhost:3000`
3. API on `http://localhost:8000/api/`
4. Django admin on `http://localhost:8000/admin/`

Default demo users are seeded on startup (admin, manager, employees).

---

## 10) Security & compliance notes

- JWT + token rotation/blacklist
- Login throttling by IP and targeted username
- CORS and production hardening options
- LPD-oriented retention policy values in settings
- Privacy page exposed publicly

---

## 11) In one sentence

This is a full **employee time-tracking SaaS-style platform** with QR+GPS attendance, approvals, and admin governance, split into Django API + React app + optional Astro marketing site.

---

## 12) Pre-deployment requirements (before using with real employees)

### 🔴 Critical — do before going live

| # | Action | Where |
|---|--------|-------|
| 1 | Replace all placeholder info: company name, address, registration number, DPO email | `frontend/src/pages/PrivacyPage.jsx`, `PRIVACY.md` |
| 2 | Get the privacy policy reviewed by a lawyer or DPO (explicitly marked as template) | `PRIVACY.md` |
| 3 | Inform employees in writing before deploying — note de service + work contract mention | Organisational |
| 4 | Sign a hosting Data Processing Agreement (DPA) with your hosting provider | `LPD.md → Section C` |
| 5 | Change all default passwords (`changeme`, `password123`) and set a real `DJANGO_SECRET_KEY` | `docker-compose.yml` / `.env.production` |

### 🟡 Important — do within the first month

| # | Action | Where |
|---|--------|-------|
| 6 | Configure production `.env` file: real domain, DB credentials, SMTP email config | `docker-compose.prod.yml` |
| 7 | Set `SKIP_SEED=1` in production so demo accounts are not created | Env var |
| 8 | Enable and verify daily DB backups via `ops/backup.sh` | `ops/README.md` |
| 9 | Designate a data protection contact (HR, legal, or yourself) | Organisational |
| 10 | Run a DPIA (impact assessment) for GPS tracking of employees | `LPD.md → Section B` |

### 🟢 Recommended — security hardening

| # | Action | Notes |
|---|--------|-------|
| 11 | Move JWT tokens from `localStorage` to `HttpOnly` cookies | `frontend/src/api/axiosInstance.js` — protects against XSS |
| 12 | Enable 2FA for admin and manager accounts | Not implemented yet |
| 13 | Add CSP (Content Security Policy) headers | Caddy config |
| 14 | Implement automatic GPS data purge after 12 months | Currently missing per `LPD.md` checklist |

### ✅ Quickest safe path to go live

1. Fill in company name, address, and contact email in the privacy policy
2. Set a real `DJANGO_SECRET_KEY`, real DB password, and real domain in `.env.production`
3. Set `SKIP_SEED=1`
4. Give employees a written notice explaining the tool, the GPS scan, and their data rights
5. Deploy with:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```