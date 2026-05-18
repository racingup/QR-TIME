"""Constantes métier partagées.

Importer depuis ici plutôt que d'utiliser des magic numbers en dur dans
le code. Sert aussi de référence pour les valeurs par défaut admin.
"""
from __future__ import annotations

# ── Heures de travail ──────────────────────────────────────────────────
# Référence GAZNAT : 42h/semaine = 8h24/jour = 504 min.
DEFAULT_WEEKLY_HOURS = 42
DEFAULT_DAILY_MINUTES = (DEFAULT_WEEKLY_HOURS * 60) // 5  # 504

# Seuil de majoration par défaut (GAZNAT : 8h30/jour).
DEFAULT_OVERTIME_THRESHOLD_MINUTES = 510

# Limites journalières par défaut (Art. 9 LTr).
DEFAULT_DAILY_MAX_MINUTES = 630  # 10h30

# ── Pauses ─────────────────────────────────────────────────────────────
# OLT 1 Art. 18 : 30 min de pause pour > 7h travaillées.
DEFAULT_BREAK_TRIGGER_MINUTES = 360  # 6h
DEFAULT_BREAK_DURATION_MINUTES = 30

# ── Verrou mensuel ─────────────────────────────────────────────────────
DEFAULT_MONTH_LOCK_DAY = 10

# ── Congés ─────────────────────────────────────────────────────────────
DEFAULT_VACATION_QUOTA_DAYS = 25  # 5 semaines (standard CH)

# ── Tolérance / arrondi ────────────────────────────────────────────────
DEFAULT_TOLERANCE_MINUTES = 5

# ── Limites techniques ─────────────────────────────────────────────────
MANUAL_SESSION_MAX_HOURS = 24
FUTURE_TIMESTAMP_DAYS_MARGIN = 1
HISTORY_MAX_RANGE_DAYS = 366

# ── Consentements (kinds normalisés) ───────────────────────────────────
CONSENT_KIND_GPS = "GPS"
CONSENT_KIND_STORAGE = "STORAGE"
CONSENT_KIND_PRIVACY_POLICY = "PRIVACY_POLICY"
CONSENT_KINDS = (CONSENT_KIND_GPS, CONSENT_KIND_STORAGE, CONSENT_KIND_PRIVACY_POLICY)
