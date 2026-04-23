"""Throttles attachés à l'endpoint de login (défense contre credential-stuffing).

Deux couches sont appliquées simultanément :

  - `LoginIPThrottle`   : compteur par IP cliente (bloque le brute-force d'une
                          machine attaquante).
  - `LoginUserThrottle` : compteur par *identifiant ciblé* lu dans le body
                          (bloque l'étalement d'une même attaque sur un pool
                          d'IPs — pratique courante des botnets).

Les deux s'additionnent : il suffit qu'UN des deux sature pour que l'auth
soit refusée (429). Les compteurs persistent dans Redis via le cache Django.
"""
from __future__ import annotations

import re

from rest_framework.throttling import SimpleRateThrottle


_CUSTOM_RATE = re.compile(r"^(\d+)/(\d+)?(s|m|min|h|hour|d|day|sec|second|minute)s?$")
_UNIT_SECONDS = {
    "s": 1, "sec": 1, "second": 1,
    "m": 60, "min": 60, "minute": 60,
    "h": 3600, "hour": 3600,
    "d": 86400, "day": 86400,
}


class _CustomRateThrottle(SimpleRateThrottle):
    """Étend SimpleRateThrottle avec une syntaxe `N/<count><unit>` (ex: 5/15min).

    DRF de base ne supporte que `N/unit` (5/hour). Nous voulons une fenêtre
    précise (15 min). On parse nous-mêmes `5/15min` → (5 requêtes, 900 s).
    """

    def parse_rate(self, rate):
        if rate is None:
            return (None, None)
        m = _CUSTOM_RATE.match(rate.strip())
        if not m:
            return super().parse_rate(rate)
        num, count, unit = m.groups()
        return int(num), (int(count) if count else 1) * _UNIT_SECONDS[unit]


class LoginIPThrottle(_CustomRateThrottle):
    """Limite globale par IP source."""

    scope = "login_ip"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)  # Respecte X-Forwarded-For si NUM_PROXIES set
        return self.cache_format % {"scope": self.scope, "ident": ident}


class LoginUserThrottle(_CustomRateThrottle):
    """Limite par identifiant ciblé (champ `username` du payload)."""

    scope = "login_user"

    def get_cache_key(self, request, view):
        # L'identifiant peut être dans `request.data` (JSON) ou `request.POST`.
        # On prend la valeur basse-sensitive pour éviter le contournement casse.
        username = ""
        data = getattr(request, "data", None) or {}
        raw = data.get("username") if isinstance(data, dict) else None
        if raw:
            username = str(raw).strip().lower()
        if not username:
            # Pas d'identifiant → on se rabat sur l'IP pour éviter de laisser
            # passer les hits anonymes.
            username = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": username}
