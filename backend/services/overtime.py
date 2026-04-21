"""Overtime calculation. Triggered on the final clock_out of a day."""
from __future__ import annotations

from datetime import date as date_type
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from apps.users.models import UserProfile


def compute_overtime(user: "UserProfile", date: date_type) -> Decimal:
    """Return overtime delta in hours (worked − daily target) for the given day.

    Sums the rounded duration of all closed sessions whose clock_in_rounded
    falls on `date`, then subtracts user.daily_target_hours.
    Positive = overtime, negative = under target. Rounded to 2 decimals.
    """
    sessions = user.sessions.filter(
        clock_in_rounded__date=date,
        clock_out_rounded__isnull=False,
    )
    worked_minutes = sum(s.duration_minutes for s in sessions)
    worked_hours = Decimal(worked_minutes) / Decimal(60)
    delta = worked_hours - user.daily_target_hours
    return delta.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
