"""Overtime calculation with configurable majoration rules.

Triggered on the final clock_out of a day.
Rules are loaded dynamically from MajorationRule so admins can tune rates
without redeployment.
WorkTimePolicy drives break deductions and holiday-eve reduced targets.
"""
from __future__ import annotations

from datetime import date as date_type, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from apps.users.models import UserProfile


def reconcile_overtime_balance(user: "UserProfile") -> Decimal:
    """Recompute `overtime_balance` from scratch (sum of daily deltas).

    Idempotent : peut être appelée plusieurs fois sans risque de
    double-comptage. À utiliser après toute opération qui change
    les pointages (création manuelle, édition, suppression).

    Scope : tous les jours où l'utilisateur a au moins une session.
    """
    from apps.clocking.models import ClockSession

    # Tous les jours distincts couverts par les sessions (clock_in).
    # `dates` retourne une liste de date python triée.
    days = (
        ClockSession.objects
        .filter(user=user)
        .dates("clock_in", "day")
    )
    total = Decimal("0")
    for d in days:
        total += compute_overtime(user, d)
    user.overtime_balance = total
    user.save(update_fields=["overtime_balance"])
    return total


def compute_overtime(user: "UserProfile", date: date_type) -> Decimal:
    """Return overtime delta in hours (weighted) for the given day.

    Worked = sum of closed sessions + compensable travel minutes for FIELD
    missions (Art. 13 al. 3 OLT 1).

    Overnight break deduction is applied when WorkTimePolicy.auto_deduct_break
    is enabled and worked minutes exceed break_trigger_minutes.

    Overtime hours beyond the configured thresholds are weighted by the
    applicable MajorationRule rate. If no rule applies, the raw delta is used.

    On a day that precedes a public holiday, the target hours are reduced to
    WorkTimePolicy.eve_holiday_reduced_minutes / 60 (when > 0).

    Returns a signed decimal in hours (positive = overtime, negative = deficit).
    """
    from apps.users.models import SiteHoliday, WorkTimePolicy
    from services.missions_travel import daily_travel_compensable_minutes
    from services.sessions import worked_minutes_on_day

    policy = WorkTimePolicy.load()

    # Tronquer chaque session au jour considéré + union d'intervalles.
    # Une session de nuit (23:30 → 01:00) compte pour 30 min sur le jour 1
    # ET 60 min sur le jour 2.
    worked_minutes = worked_minutes_on_day(user, date)
    worked_minutes += daily_travel_compensable_minutes(user, date)

    # ── Break deduction (auto) ───────────────────────────────────────────
    if policy.auto_deduct_break and worked_minutes >= policy.break_trigger_minutes:
        deduction = max(0, policy.break_duration_minutes - policy.paid_break_minutes)
        worked_minutes = max(0, worked_minutes - deduction)

    weighted_hours = _apply_majoration_rules(worked_minutes, date)

    # ── Holiday-eve reduced target ───────────────────────────────────────
    target_hours = user.daily_target_hours
    if policy.eve_holiday_reduced_minutes > 0:
        next_day = date + timedelta(days=1)
        if SiteHoliday.objects.filter(date=next_day).exists():
            target_hours = Decimal(str(policy.eve_holiday_reduced_minutes)) / 60

    delta = Decimal(str(weighted_hours)) - target_hours
    return delta.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _apply_majoration_rules(worked_minutes: int, date: date_type) -> float:
    """Apply active MajorationRule to convert raw worked minutes → weighted hours.

    Rules are applied in order (by `order` then `threshold_minutes`).
    Only the first matching rule above the threshold is applied (not stacked).
    For base hours (≤ threshold), the 1:1 conversion applies.
    """
    from apps.users.models import MajorationRule, SiteHoliday

    rules = list(MajorationRule.objects.filter(is_active=True).order_by("order", "threshold_minutes"))
    if not rules:
        return worked_minutes / 60

    is_weekend = date.weekday() >= 5
    is_holiday = SiteHoliday.objects.filter(date=date).exists()

    for rule in rules:
        dt = rule.day_type
        if dt == "WEEKDAY" and (is_weekend or is_holiday):
            continue
        if dt == "WEEKEND" and not is_weekend:
            continue
        if dt == "HOLIDAY" and not is_holiday:
            continue

        # Rule applies to this day type.
        if worked_minutes <= rule.threshold_minutes:
            # Below threshold — no majoration applies.
            return worked_minutes / 60

        over_minutes = worked_minutes - rule.threshold_minutes
        base_hours = rule.threshold_minutes / 60
        weighted_hours = base_hours + (over_minutes * float(rule.rate)) / 60
        return weighted_hours

    # No matching rule: raw conversion.
    return worked_minutes / 60
