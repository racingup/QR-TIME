"""Django settings for the timbreuse project."""
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-only-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.users.apps.UsersConfig",
    "apps.clocking.apps.ClockingConfig",
    "apps.missions.apps.MissionsConfig",
    "apps.absences.apps.AbsencesConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Whitenoise sert les statics Django en prod (admin CSS/JS notamment).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"
WSGI_APPLICATION = "core.wsgi.application"
ASGI_APPLICATION = "core.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


def _database_from_url() -> dict:
    url = os.environ.get("DATABASE_URL")
    if not url:
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    parsed = urlparse(url)
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username,
        "PASSWORD": parsed.password,
        "HOST": parsed.hostname,
        "PORT": parsed.port or 5432,
    }


DATABASES = {"default": _database_from_url()}

AUTH_USER_MODEL = "users.UserProfile"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Whitenoise: compressed + hashed filenames in prod.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
        if not DEBUG
        else "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

# ── Production hardening (only when DEBUG=0) ───────────────────────────
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # 30 days
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"
    CSRF_TRUSTED_ORIGINS = [
        o for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()
    ]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    # Throttles sont attachés explicitement aux vues sensibles (login).
    # On utilise des scopes nommés et pas le throttle global, pour ne pas
    # brider les endpoints applicatifs d'un user authentifié.
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        # 5 tentatives de login par IP par 15 minutes, puis 403.
        "login_ip": "5/15min",
        # 5 tentatives par *identifiant ciblé* par 15 minutes — empêche
        # un attaquant d'étaler un credential-stuffing sur plusieurs IP.
        "login_user": "5/15min",
    },
}

# Cache Django sur Redis — requis par les throttles (persistence des compteurs
# entre requêtes et entre workers gunicorn).
# Si REDIS_URL est vide (dev local sans Redis), on bascule sur le cache mémoire.
_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CACHES = {
    "default": (
        {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
            "KEY_PREFIX": "timbreuse",
        }
        if _redis_url
        else {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "KEY_PREFIX": "timbreuse",
        }
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", 60))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", 7))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()
]

CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_TIMEZONE = TIME_ZONE
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    "detect-forgotten-clockouts": {
        "task": "apps.clocking.tasks.detect_forgotten_clockouts",
        # Tous les soirs à 20h00 heure locale (Europe/Paris).
        "schedule": crontab(hour=20, minute=0),
    },
    "purge-old-data": {
        "task": "apps.users.tasks.purge_old_data_task",
        # Tous les dimanches à 03h00 heure locale.
        # Charge faible, pas de pic utilisateur.
        "schedule": crontab(hour=3, minute=0, day_of_week=0),
    },
}

# ── Politique de rétention LPD (Art. 6 al. 4 — limitation dans le temps) ──
# Par défaut : 5 ans pour les données de pointage / missions / absences,
# 10 ans pour le journal d'audit (aligné Art. 958f CO — pièces comptables).
# Ces valeurs sont conservatrices et adaptées à la majorité des contextes
# d'employeur suisse. À ajuster en fonction du règlement interne.
RETENTION_TIME_DATA_YEARS = int(os.environ.get("RETENTION_TIME_DATA_YEARS", 5))
RETENTION_AUDIT_LOG_YEARS = int(os.environ.get("RETENTION_AUDIT_LOG_YEARS", 10))

# ── Email (rappels d'oubli de pointage notamment) ──────────────────────────
# Console en dev (les mails s'écrivent dans les logs gunicorn).
# SMTP en prod via les variables EMAIL_HOST/USER/PASSWORD/PORT/USE_TLS.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "1") == "1"
DEFAULT_FROM_EMAIL = os.environ.get(
    "DEFAULT_FROM_EMAIL", "qrtime.ch <no-reply@qrtime.ch>",
)
SERVER_EMAIL = DEFAULT_FROM_EMAIL
# URL publique pour les liens cliquables dans les mails.
SITE_PUBLIC_URL = os.environ.get("SITE_PUBLIC_URL", "http://localhost:3001")
