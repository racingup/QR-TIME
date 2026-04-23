"""Tests du snapshot trajet pro à l'approbation d'une mission FIELD.

Vérifie :
  - REMOTE n'enregistre PAS de trajet (pas de déplacement).
  - FIELD avec domicile + ORS OK → champs `travel_minutes_actual` et
    `travel_minutes_compensable` remplis selon la formule Art. 13 al. 3 OLT 1.
  - FIELD sans domicile → mission approuvable, champs trajet à None.
  - FIELD avec mission plus proche que le site → compensable=0.
  - `time_spent_minutes` exposé par le serializer = pointage + compensable.
"""
from datetime import date, datetime, timedelta, timezone as dt_tz
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from apps.clocking.models import ClockSession
from apps.missions.models import Mission
from apps.missions.serializers import MissionSerializer
from apps.users.models import Site, UserProfile
from services.routing import (
    Router, reset_router_for_tests, set_router_for_tests,
)


class _FixedRouter(Router):
    """Renvoie une valeur configurable, ou None pour simuler une panne."""

    def __init__(self, minutes):
        self.minutes = minutes

    def compute_minutes(self, *a, **kw):
        return self.minutes


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class MissionTravelSnapshotTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(
            name="Lausanne", latitude=Decimal("46.519"),
            longitude=Decimal("6.633"), qr_code_token="t",
        )
        cls.manager = UserProfile.objects.create_user(
            username="mgr", password="x", is_manager=True, home_site=cls.site,
        )
        # Alice : domicile défini, trajet standard = 15 min.
        cls.alice = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site,
            home_lat=Decimal("46.580"), home_lon=Decimal("6.650"),
            standard_commute_minutes=15,
        )
        # Bob : pas de domicile saisi par l'admin.
        cls.bob = UserProfile.objects.create_user(
            username="bob", password="x", home_site=cls.site,
        )

    def setUp(self):
        cache.clear()

    def tearDown(self):
        reset_router_for_tests()

    def _create_field_mission(self, user=None):
        return Mission.objects.create(
            user=user or self.alice,
            mission_type=Mission.Type.FIELD,
            date_start=date.today(),
            date_end=date.today(),
            location_name="Client X",
            location_lat=Decimal("46.800"),
            location_lon=Decimal("7.150"),
        )

    def test_remote_mission_does_not_compute_travel(self):
        m = Mission.objects.create(
            user=self.alice, mission_type=Mission.Type.REMOTE,
            date_start=date.today(), date_end=date.today(),
        )
        m.approve(self.manager)
        m.refresh_from_db()
        self.assertIsNone(m.travel_minutes_actual)
        self.assertIsNone(m.travel_minutes_compensable)

    def test_field_mission_records_compensable_travel(self):
        # ORS répond 45 min aller. standard=15. → compensable=(45−15)*2=60 A/R.
        set_router_for_tests(_FixedRouter(45))
        m = self._create_field_mission()
        m.approve(self.manager)
        m.refresh_from_db()
        self.assertEqual(m.travel_minutes_actual, 45)
        self.assertEqual(m.travel_minutes_compensable, 60)

    def test_field_mission_closer_than_site_is_zero(self):
        set_router_for_tests(_FixedRouter(10))  # 10 min < 15 standard
        m = self._create_field_mission()
        m.approve(self.manager)
        m.refresh_from_db()
        self.assertEqual(m.travel_minutes_actual, 10)
        self.assertEqual(m.travel_minutes_compensable, 0)  # max(0, ...)

    def test_field_mission_user_without_home_address(self):
        # Bob n'a pas de domicile → ORS pas appelé → champs restent None.
        # Mission s'approuve quand même (fail-open).
        set_router_for_tests(_FixedRouter(99))  # ne devrait pas être appelé
        m = self._create_field_mission(user=self.bob)
        m.approve(self.manager)
        m.refresh_from_db()
        self.assertEqual(m.status, Mission.Status.APPROVED)
        self.assertIsNone(m.travel_minutes_actual)
        self.assertIsNone(m.travel_minutes_compensable)

    def test_field_mission_user_without_standard_commute(self):
        # Carl a une adresse mais pas de standard_commute_minutes (jamais
        # calculé). On crédite le trajet COMPLET A/R, conservateur.
        carl = UserProfile.objects.create_user(
            username="carl", password="x", home_site=self.site,
            home_lat=Decimal("46.600"), home_lon=Decimal("6.700"),
            standard_commute_minutes=None,
        )
        set_router_for_tests(_FixedRouter(30))
        m = self._create_field_mission(user=carl)
        m.approve(self.manager)
        m.refresh_from_db()
        self.assertEqual(m.travel_minutes_actual, 30)
        self.assertEqual(m.travel_minutes_compensable, 60)  # 30 × 2

    def test_router_failure_does_not_block_approval(self):
        # ORS HS → travel reste None mais mission s'approuve.
        set_router_for_tests(_FixedRouter(None))
        m = self._create_field_mission()
        m.approve(self.manager)
        m.refresh_from_db()
        self.assertEqual(m.status, Mission.Status.APPROVED)
        self.assertIsNone(m.travel_minutes_actual)
        self.assertIsNone(m.travel_minutes_compensable)


class MissionSerializerTimeSpentTests(TestCase):
    """time_spent_minutes = pointage + travel_minutes_compensable."""

    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(
            name="HQ", latitude=Decimal("46.5"), longitude=Decimal("6.6"),
            qr_code_token="t",
        )
        cls.user = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site,
        )

    def test_time_spent_includes_compensable_travel(self):
        m = Mission.objects.create(
            user=self.user, mission_type=Mission.Type.FIELD,
            date_start=date.today(), date_end=date.today(),
            travel_minutes_actual=45,
            travel_minutes_compensable=60,
        )
        ci = datetime(2026, 4, 22, 9, 0, tzinfo=dt_tz.utc)
        co = datetime(2026, 4, 22, 17, 0, tzinfo=dt_tz.utc)
        ClockSession.objects.create(
            user=self.user, site=self.site, mission=m,
            clock_in=ci, clock_in_rounded=ci,
            clock_out=co, clock_out_rounded=co,
        )
        data = MissionSerializer(m).data
        # 8h pointage = 480 min ; +60 min compensable = 540 min.
        self.assertEqual(data["clocked_minutes"], 480)
        self.assertEqual(data["time_spent_minutes"], 540)
        self.assertEqual(data["travel_minutes_compensable"], 60)
        self.assertEqual(data["travel_minutes_actual"], 45)

    def test_time_spent_falls_back_to_clocked_when_no_travel(self):
        m = Mission.objects.create(
            user=self.user, mission_type=Mission.Type.FIELD,
            date_start=date.today(), date_end=date.today(),
            # Pas de travel snapshot (mission non encore approuvée, ou domicile manquant).
        )
        ci = datetime(2026, 4, 22, 9, 0, tzinfo=dt_tz.utc)
        co = datetime(2026, 4, 22, 13, 0, tzinfo=dt_tz.utc)
        ClockSession.objects.create(
            user=self.user, site=self.site, mission=m,
            clock_in=ci, clock_in_rounded=ci,
            clock_out=co, clock_out_rounded=co,
        )
        data = MissionSerializer(m).data
        self.assertEqual(data["clocked_minutes"], 240)
        self.assertEqual(data["time_spent_minutes"], 240)  # pas de bonus
