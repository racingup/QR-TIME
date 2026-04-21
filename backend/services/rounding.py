"""Time-rounding helpers. Single source of truth for clock-time tolerance.

Semantics: ``tolerance_minutes`` defines a *grace window* around each
hour boundary. A clock event within ±tolerance of an hour snaps to that
hour; events outside the window are left untouched. The grace pattern
favours the employee — a 2-min late punch still counts as on-time.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Protocol


class _ToleranceLike(Protocol):
    tolerance_minutes: int
    rounding_direction: str  # "DOWN" | "UP" | "NEAREST"


def apply_rounding(dt: datetime, config: _ToleranceLike) -> datetime:
    """Snap dt to the nearest hour if within config.tolerance_minutes.

    Direction:
      - NEAREST: snap to whichever hour boundary is closer, when in range
      - UP:      snap forward to the next hour, when in range
      - DOWN:    snap back to the previous hour, when in range

    Outside the grace window, dt is returned unchanged. Tzinfo preserved.
    tolerance_minutes <= 0 disables rounding.
    """
    tol_min = int(config.tolerance_minutes)
    if tol_min <= 0:
        return dt

    tol = timedelta(minutes=tol_min)
    hour_floor = dt.replace(minute=0, second=0, microsecond=0)
    hour_ceil = hour_floor + timedelta(hours=1)
    diff_floor = dt - hour_floor      # time since previous hour
    diff_ceil = hour_ceil - dt        # time until next hour

    direction = config.rounding_direction
    in_floor = diff_floor <= tol
    in_ceil = diff_ceil <= tol

    if direction == "DOWN":
        return hour_floor if in_floor else dt
    if direction == "UP":
        return hour_ceil if in_ceil else dt

    # NEAREST: prefer the closer boundary; tie goes to the previous hour.
    if in_floor and in_ceil:
        return hour_floor if diff_floor <= diff_ceil else hour_ceil
    if in_floor:
        return hour_floor
    if in_ceil:
        return hour_ceil
    return dt
