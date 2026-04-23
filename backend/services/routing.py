"""Routing service — calcule un temps de trajet voiture entre deux points GPS.

Utilisé par :
  - le recalcul auto du trajet standard domicile → site de rattachement
    (`UserProfile.standard_commute_minutes`)
  - le calcul du temps de trajet professionnel à l'approbation d'une mission
    (`Mission.travel_minutes_actual` puis `travel_minutes_compensable`)

Backend par défaut : **OpenRouteService** (https://openrouteservice.org).
- Endpoint v2 directions, profil `driving-car`.
- Clé API : `settings.ORS_API_KEY`.
- Free tier : 2000 requêtes / jour, 40 / minute → largement suffisant.

L'interface est abstraite (`Router`), et la fabrique `get_router()` choisit
l'implémentation via `settings.ROUTING_BACKEND` (`ors` par défaut, futur `osrm`
si self-host). Tout le code applicatif n'appelle que `compute_minutes(...)` —
swap d'engine sans changer un seul appel.

Design "fail-open" :
- Toute erreur réseau / quota / config → renvoie `None` (pas d'exception).
- L'appelant traite `None` comme « pas de calcul disponible » sans planter.
- Évite qu'un endpoint admin échoue parce qu'ORS est temporairement HS.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Optional

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


# ── Cache ─────────────────────────────────────────────────────────────────
# Un trajet voiture entre deux points fixes ne change pas tous les jours.
# 7 jours est un bon compromis : on capte les évolutions de réseau routier
# (chantiers de longue durée) sans hammeriser l'API gratuite.
_CACHE_TTL_SECONDS = 7 * 24 * 3600
_CACHE_KEY_FMT = "routing:car:{from_lat}:{from_lon}:{to_lat}:{to_lon}"


def _round_coord(x: float) -> float:
    """Arrondit à 5 décimales (~1 m) pour stabiliser les clés de cache."""
    return round(float(x), 5)


def _cache_key(from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> str:
    return _CACHE_KEY_FMT.format(
        from_lat=_round_coord(from_lat), from_lon=_round_coord(from_lon),
        to_lat=_round_coord(to_lat), to_lon=_round_coord(to_lon),
    )


# ── Interface ─────────────────────────────────────────────────────────────


class Router(ABC):
    """Contrat commun à tous les backends de routing."""

    @abstractmethod
    def compute_minutes(
        self, from_lat: float, from_lon: float, to_lat: float, to_lon: float,
    ) -> Optional[int]:
        """Renvoie le temps voiture en minutes (entier arrondi) ou None si
        non calculable (réseau, quota, config, points trop proches/loin)."""
        raise NotImplementedError


# ── Implémentation ORS ────────────────────────────────────────────────────


class ORSRouter(Router):
    """OpenRouteService — appel REST direct (pas de SDK pour rester léger)."""

    BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-car"
    HTTP_TIMEOUT_S = 6

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "ORS_API_KEY", "") or ""

    def compute_minutes(
        self, from_lat: float, from_lon: float, to_lat: float, to_lon: float,
    ) -> Optional[int]:
        # Court-circuit : points identiques (à 1 m près) → trajet nul.
        if (
            _round_coord(from_lat) == _round_coord(to_lat)
            and _round_coord(from_lon) == _round_coord(to_lon)
        ):
            return 0
        if not self.api_key:
            logger.info("ORSRouter: ORS_API_KEY non configurée — trajet non calculé.")
            return None

        # Cache lookup (évite de dépenser le quota).
        key = _cache_key(from_lat, from_lon, to_lat, to_lon)
        cached = cache.get(key)
        if cached is not None:
            return cached

        # ORS attend [lon, lat] (norme GeoJSON), pas [lat, lon].
        payload = {
            "coordinates": [
                [_round_coord(from_lon), _round_coord(from_lat)],
                [_round_coord(to_lon), _round_coord(to_lat)],
            ],
            "instructions": False,
            "geometry": False,
            "units": "m",
        }
        try:
            resp = requests.post(
                self.BASE_URL,
                headers={
                    "Authorization": self.api_key,
                    "Content-Type": "application/json; charset=utf-8",
                    "Accept": "application/json",
                },
                json=payload,
                timeout=self.HTTP_TIMEOUT_S,
            )
        except Exception as exc:  # noqa: BLE001 — network/timeout/whatever
            logger.warning("ORSRouter: appel ORS échoué (%s).", exc)
            return None

        if resp.status_code != 200:
            logger.warning(
                "ORSRouter: ORS HTTP %s body=%s", resp.status_code, resp.text[:200],
            )
            return None

        try:
            data = resp.json()
            # Schéma v2 : routes[0].summary.duration en secondes.
            duration_s = float(
                data["routes"][0]["summary"]["duration"],
            )
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            logger.warning("ORSRouter: réponse ORS inattendue (%s) — %s", exc, resp.text[:200])
            return None

        minutes = int(round(duration_s / 60.0))
        cache.set(key, minutes, _CACHE_TTL_SECONDS)
        return minutes


# ── Fabrique ──────────────────────────────────────────────────────────────


_router_instance: Optional[Router] = None


def get_router() -> Router:
    """Singleton process-wide. Choix du backend via `settings.ROUTING_BACKEND`."""
    global _router_instance
    if _router_instance is None:
        backend = getattr(settings, "ROUTING_BACKEND", "ors").lower()
        if backend == "ors":
            _router_instance = ORSRouter()
        else:
            raise RuntimeError(
                f"ROUTING_BACKEND inconnu : {backend!r}. Valides : 'ors'.",
            )
    return _router_instance


def reset_router_for_tests() -> None:
    """À appeler dans setUp/tearDown pour injecter un mock."""
    global _router_instance
    _router_instance = None


def set_router_for_tests(router: Router) -> None:
    """Injecte un router mock — utilisé par les suites de tests."""
    global _router_instance
    _router_instance = router


# ── Helpers haut-niveau ───────────────────────────────────────────────────


def compute_commute_minutes(user) -> Optional[int]:
    """Trajet aller domicile → site de rattachement de cet utilisateur.
    None si l'adresse ou le site ne sont pas définis, ou si ORS n'a pas pu
    calculer."""
    if not user or not getattr(user, "has_home_address", False):
        return None
    site = user.home_site
    if not site or site.latitude is None or site.longitude is None:
        return None
    return get_router().compute_minutes(
        from_lat=float(user.home_lat), from_lon=float(user.home_lon),
        to_lat=float(site.latitude), to_lon=float(site.longitude),
    )


def compute_mission_travel_minutes(user, mission) -> Optional[int]:
    """Trajet aller domicile → lieu de mission.
    None si domicile ou mission sans coordonnées."""
    if not user or not getattr(user, "has_home_address", False):
        return None
    if mission.location_lat is None or mission.location_lon is None:
        return None
    return get_router().compute_minutes(
        from_lat=float(user.home_lat), from_lon=float(user.home_lon),
        to_lat=float(mission.location_lat), to_lon=float(mission.location_lon),
    )


def compensable_round_trip_minutes(
    actual_one_way: Optional[int],
    standard_one_way: Optional[int],
) -> Optional[int]:
    """Calcule le temps de trajet A/R compensable selon Art. 13 al. 3 OLT 1.

        compensable = max(0, (actual − standard) × 2)

    Retourne :
      - None si `actual` est None (impossible de calculer)
      - max(0, actual×2) si `standard` est None (pas de trajet standard
        défini pour ce user → on crédite le trajet complet, conservateur
        en faveur du collaborateur)
    """
    if actual_one_way is None:
        return None
    if standard_one_way is None:
        return max(0, int(actual_one_way) * 2)
    return max(0, (int(actual_one_way) - int(standard_one_way)) * 2)
