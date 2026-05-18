"""Régression tests pour les bugs corrigés dans le commit fd0d223.

Couvre :
  - B1 : Sessions traversant minuit (worked_minutes_on_day)
  - B3 : Session ouverte d'hier (ScanView refuse → 409)
  - B5 : Pointage manuel > 24h ou futur (ManualClockSessionView)
  - D1 : MeSummary.today.worked_minutes utilise worked_minutes_on_day
        (union d'intervalles → pas de double-comptage sur chevauchements)
  - D8 : reconcile_overtime_balance idempotent (pas de doublement à 2 appels)
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.clocking.models import ClockSession
from apps.users.models import Site, ToleranceConfig, UserProfile
from services.sessions import worked_minutes_on_day


def _aware(dt: datetime) -> datetime:
    """Helper : rend une datetime aware avec la timezone projet."""
    tz = timezone.get_current_timezone()
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, tz)
    return dt


class B1MidnightCrossingTests(TestCase):
    """B1 — Sessions traversant minuit comptent correctement sur chaque jour."""

    def setUp(self):
        self.user = UserProfile.objects.create_user(username="b1-user", password="x")
        # Désactiver l'arrondi pour des assertions exactes.
        ToleranceConfig.objects.update_or_create(
            pk=1, defaults={"tolerance_minutes": 0, "rounding_direction": "NEAREST"},
        )

    def test_session_23_30_to_01_00_splits_correctly(self):
        clock_in = _aware(datetime(2026, 5, 17, 23, 30))
        clock_out = _aware(datetime(2026, 5, 18, 1, 0))
        ClockSession.objects.create(
            user=self.user,
            clock_in=clock_in,
            clock_in_rounded=clock_in,
            clock_out=clock_out,
            clock_out_rounded=clock_out,
        )

        d17 = worked_minutes_on_day(self.user, date(2026, 5, 17))
        d18 = worked_minutes_on_day(self.user, date(2026, 5, 18))

        self.assertEqual(d17, 30, "Le 17 mai doit compter 30 min (23:30 → minuit)")
        self.assertEqual(d18, 60, "Le 18 mai doit compter 60 min (minuit → 01:00)")
        self.assertEqual(d17 + d18, 90, "Total des deux jours = 90 min")


class B3OpenSessionPreviousDayTests(TestCase):
    """B3 — Scan refusé si une session ouverte est sur un jour antérieur."""

    SITE_LAT = 48.8530
    SITE_LON = 2.3499

    def setUp(self):
        self.client = APIClient()
        self.user = UserProfile.objects.create_user(username="b3-user", password="x")
        self.site = Site.objects.create(
            name="Siège B3", latitude=self.SITE_LAT, longitude=self.SITE_LON,
            qr_code_token="b3-site-token", gps_radius_meters=150,
        )
        ToleranceConfig.objects.update_or_create(
            pk=1, defaults={"tolerance_minutes": 0, "rounding_direction": "NEAREST"},
        )
        self.client.force_authenticate(self.user)

    def test_open_session_from_yesterday_blocks_scan(self):
        yesterday_in = timezone.now() - timedelta(hours=24)  # hier ~09:00
        # On fixe explicitement à hier 09:00 pour être robuste à la timezone.
        tz = timezone.get_current_timezone()
        local_yesterday = timezone.localdate() - timedelta(days=1)
        clock_in = timezone.make_aware(
            datetime.combine(local_yesterday, time(9, 0)), tz,
        )
        ClockSession.objects.create(
            user=self.user,
            clock_in=clock_in,
            clock_in_rounded=clock_in,
            clock_out=None,
            clock_out_rounded=None,
        )
        resp = self.client.post(reverse("clock-scan"), {
            "qr_token": "b3-site-token",
            "gps_lat": self.SITE_LAT, "gps_lon": self.SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT, resp.data)
        self.assertEqual(resp.data["error"], "OPEN_SESSION_PREVIOUS_DAY")
        self.assertIn("open_session_id", resp.data)


class B5ManualClockSpanTests(TestCase):
    """B5 — Pointage manuel > 24h ou dans le futur → 400."""

    def setUp(self):
        self.client = APIClient()
        # Le créateur doit être manager.
        self.manager = UserProfile.objects.create_user(
            username="b5-mgr", password="x", is_manager=True,
        )
        self.employee = UserProfile.objects.create_user(
            username="b5-emp", password="x",
        )
        self.client.force_authenticate(self.manager)

    def test_span_over_24h_rejected(self):
        clock_in = _aware(datetime(2026, 5, 17, 10, 0))
        clock_out = _aware(datetime(2026, 5, 18, 12, 0))  # 26h
        resp = self.client.post(reverse("clock-manual"), {
            "user_id": self.employee.id,
            "clock_in": clock_in.isoformat(),
            "clock_out": clock_out.isoformat(),
            "session_type": "OFFICE",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        self.assertEqual(resp.data["error"], "SPAN_TOO_LONG")

    def test_future_clock_in_rejected(self):
        future = timezone.now() + timedelta(days=2)  # > now + 1 jour
        resp = self.client.post(reverse("clock-manual"), {
            "user_id": self.employee.id,
            "clock_in": future.isoformat(),
            "session_type": "OFFICE",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        self.assertEqual(resp.data["error"], "FUTURE_TIMESTAMP")


class D1MeSummaryWorkedMinutesAlignedTests(TestCase):
    """D1 — MeSummary today.worked_minutes utilise worked_minutes_on_day.

    Avec deux sessions chevauchantes 09:00-12:00 et 10:00-11:00, on doit
    obtenir 180 min (union) et pas 240 (somme).
    """

    def setUp(self):
        self.client = APIClient()
        self.user = UserProfile.objects.create_user(username="d1-user", password="x")
        ToleranceConfig.objects.update_or_create(
            pk=1, defaults={"tolerance_minutes": 0, "rounding_direction": "NEAREST"},
        )
        self.client.force_authenticate(self.user)

    def test_overlapping_sessions_today_counted_as_union(self):
        tz = timezone.get_current_timezone()
        today = timezone.localdate()
        s1_in = timezone.make_aware(datetime.combine(today, time(9, 0)), tz)
        s1_out = timezone.make_aware(datetime.combine(today, time(12, 0)), tz)
        s2_in = timezone.make_aware(datetime.combine(today, time(10, 0)), tz)
        s2_out = timezone.make_aware(datetime.combine(today, time(11, 0)), tz)

        ClockSession.objects.create(
            user=self.user, clock_in=s1_in, clock_in_rounded=s1_in,
            clock_out=s1_out, clock_out_rounded=s1_out,
        )
        ClockSession.objects.create(
            user=self.user, clock_in=s2_in, clock_in_rounded=s2_in,
            clock_out=s2_out, clock_out_rounded=s2_out,
        )

        resp = self.client.get(reverse("me-summary"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        worked = resp.data["today"]["worked_minutes"]
        self.assertEqual(
            worked, 180,
            f"Expected 180 (union), got {worked}. Bug D1 régression : "
            f"sessions chevauchantes sont double-comptées.",
        )


class D8ReconcileOvertimeIdempotentTests(TestCase):
    """D8 — reconcile_overtime_balance idempotent.

    2 appels successifs ne doivent PAS doubler `overtime_balance`.
    """

    def setUp(self):
        self.user = UserProfile.objects.create_user(
            username="d8-user", password="x",
            weekly_target_hours=Decimal("42.00"),  # → 8.4h/jour
        )
        ToleranceConfig.objects.update_or_create(
            pk=1, defaults={"tolerance_minutes": 0, "rounding_direction": "NEAREST"},
        )

    def test_two_calls_yield_same_balance(self):
        from services.overtime import reconcile_overtime_balance
        tz = timezone.get_current_timezone()
        # Deux jours avec 8h chacun (légèrement sous le target 8.4h → delta négatif).
        day1 = date(2026, 5, 11)  # lundi
        day2 = date(2026, 5, 12)  # mardi
        for d in (day1, day2):
            ci = timezone.make_aware(datetime.combine(d, time(9, 0)), tz)
            co = timezone.make_aware(datetime.combine(d, time(17, 0)), tz)
            ClockSession.objects.create(
                user=self.user, clock_in=ci, clock_in_rounded=ci,
                clock_out=co, clock_out_rounded=co,
            )

        first = reconcile_overtime_balance(self.user)
        self.user.refresh_from_db()
        balance_after_first = self.user.overtime_balance

        second = reconcile_overtime_balance(self.user)
        self.user.refresh_from_db()
        balance_after_second = self.user.overtime_balance

        self.assertEqual(
            first, second,
            f"Reconcile non idempotent : {first} != {second}",
        )
        self.assertEqual(
            balance_after_first, balance_after_second,
            f"Solde doublé après 2 appels : {balance_after_first} → {balance_after_second}",
        )
