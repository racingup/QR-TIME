"""Tests for services/rounding.py."""
from datetime import datetime, timezone as dt_timezone
from types import SimpleNamespace

from django.test import SimpleTestCase

from services.rounding import apply_rounding


def _dt(h: int, m: int, s: int = 0) -> datetime:
    return datetime(2026, 4, 21, h, m, s, tzinfo=dt_timezone.utc)


def _cfg(minutes: int, direction: str = "NEAREST") -> SimpleNamespace:
    return SimpleNamespace(tolerance_minutes=minutes, rounding_direction=direction)


class ApplyRoundingTests(SimpleTestCase):
    # ── Spec cases (from cahier des charges) ───────────────────────────
    def test_spec_0858_nearest_5min_rounds_to_0900(self):
        self.assertEqual(apply_rounding(_dt(8, 58), _cfg(5, "NEAREST")), _dt(9, 0))

    def test_spec_0903_nearest_5min_rounds_to_0900(self):
        self.assertEqual(apply_rounding(_dt(9, 3), _cfg(5, "NEAREST")), _dt(9, 0))

    # ── NEAREST ────────────────────────────────────────────────────────
    def test_nearest_outside_window_unchanged(self):
        # 09:30 is well outside ±5 min of any hour → unchanged
        self.assertEqual(apply_rounding(_dt(9, 30), _cfg(5, "NEAREST")), _dt(9, 30))

    def test_nearest_just_within_window_after_hour(self):
        self.assertEqual(apply_rounding(_dt(9, 5), _cfg(5, "NEAREST")), _dt(9, 0))

    def test_nearest_just_within_window_before_hour(self):
        self.assertEqual(apply_rounding(_dt(8, 55), _cfg(5, "NEAREST")), _dt(9, 0))

    def test_nearest_just_outside_window(self):
        # 09:06 is 6 min from 09:00 and 54 min from 10:00 → unchanged
        self.assertEqual(apply_rounding(_dt(9, 6), _cfg(5, "NEAREST")), _dt(9, 6))

    # ── DOWN ───────────────────────────────────────────────────────────
    def test_down_within_window_snaps_back(self):
        self.assertEqual(apply_rounding(_dt(9, 4), _cfg(5, "DOWN")), _dt(9, 0))

    def test_down_before_hour_unchanged(self):
        # 08:58 is *before* 09:00 — DOWN snaps back to the *previous* hour;
        # 08:58 is 58 min after 08:00 (way outside tol) → unchanged.
        self.assertEqual(apply_rounding(_dt(8, 58), _cfg(5, "DOWN")), _dt(8, 58))

    # ── UP ─────────────────────────────────────────────────────────────
    def test_up_within_window_snaps_forward(self):
        self.assertEqual(apply_rounding(_dt(8, 58), _cfg(5, "UP")), _dt(9, 0))

    def test_up_after_hour_unchanged(self):
        # 09:03 is *after* 09:00 — UP looks at next hour 10:00, 57 min away → unchanged.
        self.assertEqual(apply_rounding(_dt(9, 3), _cfg(5, "UP")), _dt(9, 3))

    # ── EDGE CASES ─────────────────────────────────────────────────────
    def test_exact_hour_unchanged(self):
        for direction in ("DOWN", "UP", "NEAREST"):
            self.assertEqual(
                apply_rounding(_dt(9, 0), _cfg(5, direction)), _dt(9, 0),
            )

    def test_zero_tolerance_returns_input(self):
        moment = _dt(9, 3, 17)
        self.assertEqual(apply_rounding(moment, _cfg(0)), moment)

    def test_preserves_timezone(self):
        result = apply_rounding(_dt(8, 58), _cfg(5, "NEAREST"))
        self.assertEqual(result.tzinfo, dt_timezone.utc)

    def test_large_tolerance_window_picks_closer_hour(self):
        # tol=30 → 09:20 is in both windows (≤30 from 09:00 and from 10:00).
        # 09:20 is 20 min from 09:00 and 40 from 10:00 → 09:00.
        self.assertEqual(apply_rounding(_dt(9, 20), _cfg(30, "NEAREST")), _dt(9, 0))
        # 09:40 is 40 from 09:00 and 20 from 10:00 → 10:00.
        self.assertEqual(apply_rounding(_dt(9, 40), _cfg(30, "NEAREST")), _dt(10, 0))
