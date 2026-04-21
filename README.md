# Timbreuse — Système de pointage QR + GPS

Application web de pointage par scan de QR code avec validation GPS.
Stack : **Django 4.2 + DRF** (backend) · **React 18 + Tailwind** (frontend) · **PostgreSQL** · **Celery + Redis**.

---

## Prérequis

- **Docker** + **Docker Compose** (pour le démarrage complet en une commande)
- Optionnel, pour dev hors Docker :
  - **Python 3.11+**
  - **Node 18+**

---

## Démarrage en une commande

```bash
docker compose up --build
```

Cela construit et lance cinq services :

| Service    | Port hôte | Description                                   |
| ---------- | --------- | --------------------------------------------- |
| `db`       | 5432      | PostgreSQL 16                                 |
| `redis`    | 6379      | Broker Celery                                 |
| `backend`  | 8000      | Django + DRF                                  |
| `celery`   | —         | Worker Celery (tâche d'oubli de pointage)     |
| `frontend` | 3000      | React (build nginx, proxy `/api/` → backend)  |

Accès :

- **Frontend** : http://localhost:3000
- **Backend API** : http://localhost:8000/api/
- **Django admin** : http://localhost:8000/admin/

### Si les ports 3000 ou 8000 sont pris

Override via variables d'env :

```bash
BACKEND_HOST_PORT=8002 FRONTEND_HOST_PORT=3001 docker compose up --build
```

---

## Accès par défaut

L'entrypoint crée / met à jour ces comptes à chaque démarrage :

| Login    | Mot de passe  | Rôle                                         |
| -------- | ------------- | -------------------------------------------- |
| `admin`  | `changeme`    | Superuser (peut valider ses propres demandes) |
| `claire` | `password123` | Manager                                       |
| `alice`  | `password123` | Salariée (42h/sem, pointée "en cours")        |
| `bob`    | `password123` | Salarié (21h/sem, temps partiel)              |

Un site de démo (`Siège Paris`) avec un QR stable (`demo-site-paris-token`)
et une mission REMOTE approuvée pour alice (`demo-mission-alice-token`)
sont également créés.

Pour désactiver le seed automatique au boot : `SKIP_SEED=1`.

---

## Variables d'environnement

Toutes les variables sont listées dans [`backend/.env.example`](backend/.env.example).
En mode Docker, `docker-compose.yml` les passe directement aux conteneurs.
En mode dev hors Docker, copier `.env.example` → `.env` dans `backend/`.

| Variable                | Défaut (Docker)                                 | Rôle                            |
| ----------------------- | ----------------------------------------------- | ------------------------------- |
| `DJANGO_SECRET_KEY`     | `docker-dev-key-change-in-prod`                 | Clé de signature Django         |
| `DJANGO_DEBUG`          | `1`                                             | Mode debug                      |
| `DJANGO_ALLOWED_HOSTS`  | `*`                                             | Hôtes autorisés                 |
| `DATABASE_URL`          | `postgres://timbreuse:timbreuse@db:5432/timbreuse` | Connexion PostgreSQL         |
| `REDIS_URL`             | `redis://redis:6379/0`                          | Broker Celery                   |
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:3000,http://localhost:8000`   | Origines CORS                   |
| `JWT_ACCESS_MINUTES`    | `60`                                            | Durée de vie du JWT access      |
| `JWT_REFRESH_DAYS`      | `7`                                             | Durée de vie du refresh token   |
| `SKIP_SEED`             | —                                               | `1` pour ne pas seed au boot    |
| `BACKEND_HOST_PORT`     | `8000`                                          | Port hôte pour le backend       |
| `FRONTEND_HOST_PORT`    | `3000`                                          | Port hôte pour le frontend      |

---

## Dev hors Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # puis éditer (remplacer `db` par `localhost`)
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 0.0.0.0:8000
# dans un autre terminal :
celery -A core worker -l info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Tests

```bash
# Backend (81 tests)
cd backend && python manage.py test

# Frontend (17 tests Vitest)
cd frontend && npm test
```

---

## Architecture

```
backend/
├── core/                         settings, urls, celery
├── apps/
│   ├── users/                    UserProfile, Site, ToleranceConfig, SiteQRAudit
│   ├── clocking/                 ClockSession, FixedTimeSlot, Alert + scan endpoint + Celery task
│   ├── missions/                 Mission + create/approve/reject/QR
│   └── absences/                 AbsenceRequest + create/approve
└── services/                     geo.py, rounding.py, overtime.py, fixed_slots.py, qr.py
                                  (logique métier pure, testée unitairement)

frontend/
├── src/
│   ├── api/                      axiosInstance + clients par domaine
│   ├── hooks/                    useAuth, useClock, useEmployee, useMissions, useGeolocation
│   ├── components/               QRScanner (html5-qrcode)
│   ├── pages/                    Scan, EmployeeDashboard, ManagerDashboard,
│   │                             MissionForm, QRPrint, AdminSettings, Login
│   ├── layouts/                  AppLayout (nav + auth gate)
│   └── test/                     fixtures + setup
```

## Règles métier clés

- **Validation GPS** : Haversine sur une terre sphérique (services/geo.py). Hors rayon → 403 avec distance exacte.
- **QR papier statique** : renouvelé manuellement par l'admin. L'ancien token est consigné dans `SiteQRAudit`. Pas de rotation automatique.
- **QR mission** : token lié à user_id + période [date_start, date_end]. Vérifié à chaque scan.
- **Arrondis** : fenêtre de grâce autour des heures pleines (ex. tolérance 5 min → 08:58 et 09:03 arrondissent à 09:00).
- **Heures sup** : calculées au dernier clock_out de la journée, ajoutées à `overtime_balance`.
- **Plages fixes** : un pointage hors plage retourne `requires_justification: true` tant que le motif n'est pas saisi.
- **Anti-self-approval** : un manager ne peut pas approuver ses propres demandes. Seul un superuser le peut.
- **Oubli de pointage** : tâche Celery planifiée à 20h00 (Europe/Paris) — marque `is_forgotten=True` et crée une `Alert`.
