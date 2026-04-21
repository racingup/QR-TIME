"""GPS utilities. Single source of truth for distance calculations."""
from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_000.0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two GPS points, in meters.

    Uses the haversine formula on a spherical Earth (radius 6 371 000 m).
    Accurate to a few meters at typical site-validation scales (≤ 1 km).
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.asin(min(1.0, math.sqrt(a)))
    return EARTH_RADIUS_M * c


def is_within_radius(
    lat: float, lon: float,
    target_lat: float, target_lon: float,
    radius_m: int,
) -> bool:
    """True iff (lat, lon) is within radius_m of the target point."""
    return haversine(lat, lon, target_lat, target_lon) <= radius_m
