"""Tests for apps/clocking/tasks.py."""
from datetime import datetime, timedelta

from django.test import TestCase
from django.utils import timezone

from apps.clocking.models import Alert, ClockSession
from apps.clocking.tasks import detect_forgotten_clockouts
from apps.users.models import UserProfile


class DetectForgottenClockoutsTests(TestCase):
    def setUp(self):
        self.alice = UserProfile.objects.create_user(username="alice", password="x")
        self.bob = UserProfile.objects.create_user(username="bob", password="x")
        tz = timezone.get_current_timezone()
        today = timezone.localdate()
        self.morning = timezone.make_aware(
            datetime(today.year, today.month, today.day, 8, 30, 0), tz
        )

    def _open_session(self, user) -> ClockSession:
        return ClockSession.objects.create(
            user=user, clock_in=self.morning, clock_in_rounded=self.morning,
        )

    def _closed_session(self, user) -> ClockSession:
        end = self.morning + timedelta(hours=8)
        return ClockSession.objects.create(
            user=user,
            clock_in=self.morning, clock_in_rounded=self.morning,
            clock_out=end, clock_out_rounded=end,
        )

    def test_open_today_session_is_flagged_and_alerted(self):
        session = self._open_session(self.alice)
        result = detect_forgotten_clockouts()
        self.assertEqual(result["flagged"], 1)
        self.assertEqual(result["alerts_created"], 1)
        session.refresh_from_db()
        self.assertTrue(session.is_forgotten)
        alert = Alert.objects.get(session=session)
        self.assertEqual(alert.kind, Alert.Kind.FORGOTTEN_CLOCKOUT)
        self.assertEqual(alert.user, self.alice)
        self.assertIn("alice", alert.message)

    def test_closed_session_is_left_alone(self):
        self._closed_session(self.alice)
        result = detect_forgotten_clockouts()
        self.assertEqual(result["flagged"], 0)
        self.assertEqual(result["alerts_created"], 0)
        self.assertFalse(Alert.objects.exists())

    def test_yesterday_open_session_not_picked_up_today(self):
        # An open session from yesterday is out of scope for today's run.
        yesterday = self.morning - timedelta(days=1)
        ClockSession.objects.create(
            user=self.alice, clock_in=yesterday, clock_in_rounded=yesterday,
        )
        result = detect_forgotten_clockouts()
        self.assertEqual(result["flagged"], 0)
        self.assertEqual(result["alerts_created"], 0)

    def test_idempotent_no_duplicate_alerts(self):
        self._open_session(self.alice)
        first = detect_forgotten_clockouts()
        second = detect_forgotten_clockouts()
        self.assertEqual(first["alerts_created"], 1)
        # Second run must not create a new alert (UniqueConstraint enforces it).
        self.assertEqual(second["alerts_created"], 0)
        # Already-flagged session is not re-flagged.
        self.assertEqual(second["flagged"], 0)
        self.assertEqual(Alert.objects.count(), 1)

    def test_multiple_users_each_get_alert(self):
        self._open_session(self.alice)
        self._open_session(self.bob)
        result = detect_forgotten_clockouts()
        self.assertEqual(result["flagged"], 2)
        self.assertEqual(result["alerts_created"], 2)
        self.assertEqual(
            set(Alert.objects.values_list("user__username", flat=True)),
            {"alice", "bob"},
        )

    def test_celery_beat_schedule_is_registered(self):
        from django.conf import settings
        sched = settings.CELERY_BEAT_SCHEDULE.get("detect-forgotten-clockouts")
        self.assertIsNotNone(sched)
        self.assertEqual(sched["task"], "apps.clocking.tasks.detect_forgotten_clockouts")
