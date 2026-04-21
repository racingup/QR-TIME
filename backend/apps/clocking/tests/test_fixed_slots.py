"""Tests for services/fixed_slots.py."""
from datetime import datetime, time, timezone as dt_timezone
from types import SimpleNamespace

from django.test import SimpleTestCase

from services.fixed_slots import requires_justification


def _slot(start: str, end: str) -> SimpleNamespace:
    sh, sm = (int(x) for x in start.split(":"))
    eh, em = (int(x) for x in end.split(":"))
    return SimpleNamespace(start_time=time(sh, sm), end_time=time(eh, em))


def _dt(h: int, m: int = 0) -> datetime:
    return datetime(2026, 4, 21, h, m, tzinfo=dt_timezone.utc)


class RequiresJustificationTests(SimpleTestCase):
    def setUp(self):
        self.morning = _slot("09:30", "11:30")
        self.afternoon = _slot("14:00", "16:00")
        self.slots = [self.morning, self.afternoon]

    def test_in_before_slot_start_no_justification(self):
        # 09:00 < 09:30 → on time, no justification.
        self.assertFalse(requires_justification(_dt(9), "IN", self.slots))

    def test_in_at_slot_start_no_justification(self):
        # Exactly on time.
        self.assertFalse(requires_justification(_dt(9, 30), "IN", self.slots))

    def test_in_after_slot_start_requires_justification(self):
        self.assertTrue(requires_justification(_dt(9, 45), "IN", self.slots))

    def test_out_after_all_slot_ends_no_justification(self):
        self.assertFalse(requires_justification(_dt(17), "OUT", self.slots))

    def test_out_before_slot_end_requires_justification(self):
        # Leaving at 15:00 cuts the afternoon slot short.
        self.assertTrue(requires_justification(_dt(15), "OUT", self.slots))

    def test_no_slots_never_requires(self):
        self.assertFalse(requires_justification(_dt(12), "IN", []))
        self.assertFalse(requires_justification(_dt(12), "OUT", []))
