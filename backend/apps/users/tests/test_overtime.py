"""Tests for services/overtime.py."""
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase

from apps.clocking.models import ClockSession
from apps.users.models import UserProfile
from services.overtime import compute_overtime


def _dt(h: int, m: int = 0) -> datetime:
    return datetime(2026, 4, 21, h, m, tzinfo=dt_timezone.utc)


class ComputeOvertimeTests(TestCase):
    def setUp(self):
        # weekly_target=42 → daily target = 8.4h
        self.user = UserProfile.objects.create_user(
            username="alice", password="x", weekly_target_hours=Decimal("42.00"),
        )

    def _session(self, start_h: int, end_h: int, start_m: int = 0, end_m: int = 0) -> ClockSession:
        start = _dt(start_h, start_m)
        end = _dt(end_h, end_m)
        return ClockSession.objects.create(
            user=self.user,
            clock_in=start,
            clock_out=end,
            clock_in_rounded=start,
            clock_out_rounded=end,
        )

    # ── Spec case ──────────────────────────────────────────────────────
    def test_spec_8h_worked_target_84h_balance_minus_04h(self):
        # Spec: 8h travaillées, cible 8.4h → balance = -0.4h
        self._session(8, 16)  # 8 hours
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("-0.40"),
        )

    # ── Other realistic cases ──────────────────────────────────────────
    def test_exact_target_returns_zero(self):
        # 8.4h = 8h24m
        self._session(8, 16, 0, 24)
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("0.00"),
        )

    def test_overtime_positive(self):
        # 9h vs 8.4h = +0.6h
        self._session(8, 17)
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("0.60"),
        )

    def test_multiple_sessions_summed(self):
        # 4h + 4h30 = 8.5h vs 8.4h target = +0.1h
        self._session(8, 12)
        self._session(13, 17, 0, 30)
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("0.10"),
        )

    def test_no_sessions_returns_negative_full_target(self):
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("-8.40"),
        )

    def test_open_session_excluded(self):
        # Open session (no clock_out) doesn't count.
        ClockSession.objects.create(
            user=self.user,
            clock_in=_dt(8),
            clock_in_rounded=_dt(8),
        )
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("-8.40"),
        )

    def test_other_users_sessions_ignored(self):
        other = UserProfile.objects.create_user(
            username="bob", password="x", weekly_target_hours=Decimal("42.00"),
        )
        ClockSession.objects.create(
            user=other,
            clock_in=_dt(8), clock_out=_dt(20),
            clock_in_rounded=_dt(8), clock_out_rounded=_dt(20),
        )
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("-8.40"),
        )

    def test_other_days_ignored(self):
        # Session yesterday should not count for today.
        prev_day = datetime(2026, 4, 20, 8, tzinfo=dt_timezone.utc)
        prev_end = datetime(2026, 4, 20, 16, tzinfo=dt_timezone.utc)
        ClockSession.objects.create(
            user=self.user,
            clock_in=prev_day, clock_out=prev_end,
            clock_in_rounded=prev_day, clock_out_rounded=prev_end,
        )
        self.assertEqual(
            compute_overtime(self.user, date(2026, 4, 21)), Decimal("-8.40"),
        )

    def test_part_time_user(self):
        # 21h/week → daily target = 4.2h. Worked 4h → -0.2h.
        part = UserProfile.objects.create_user(
            username="charlie", password="x", weekly_target_hours=Decimal("21.00"),
        )
        ClockSession.objects.create(
            user=part,
            clock_in=_dt(9), clock_out=_dt(13),
            clock_in_rounded=_dt(9), clock_out_rounded=_dt(13),
        )
        self.assertEqual(
            compute_overtime(part, date(2026, 4, 21)), Decimal("-0.20"),
        )

    def test_returns_decimal_with_2_places(self):
        self._session(8, 16)
        result = compute_overtime(self.user, date(2026, 4, 21))
        self.assertIsInstance(result, Decimal)
        self.assertEqual(result.as_tuple().exponent, -2)
