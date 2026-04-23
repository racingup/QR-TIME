"""Test général : le `Mission.travel_minutes_compensable` est-il bien
comptabilisé dans toutes les agrégations de temps de travail ?

Vérifie l'intégration de bout en bout :
  - `compute_overtime`     → solde heures sup quotidien
  - `DayDetailView`        → vue jour de l'employé
  - `UserMonthlyDetailView`→ drill-down du manager
  - `build_monthly_rows`   → rapport mensuel admin
  - `MissionSerializer`    → temps total de la mission

Convention : 1 trajet A/R compensable PAR JOUR avec au moins une session
sur la mission (pas par session, et pas une seule fois pour la mission
entière). Cohérent avec la pratique RH suisse standard (Art. 13 al. 3 OLT 1).
"""
from datetime import date, datetime, timedelta, timezone as dt_tz
from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clocking.models import ClockSession
from apps.missions.models import Mission
from apps.missions.serializers import MissionSerializer
from apps.users.models import Site, UserProfile
from services.overtime import compute_overtime
from services.reporting import build_monthly_rows
from services.routing import Router, reset_router_for_tests, set_router_for_tests


class _FixedRouter(Router):
    def __init__(self, minutes): self.minutes = minutes
    def compute_minutes(self, *a, **kw): return self.minutes


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class TravelTimeInAggregatesTests(APITestCase):
    """Setup commun : alice, domicile défini, standard commute = 15 min,
    mission FIELD à 45 min de chez elle. Compensable A/R = (45-15)*2 = 60 min."""

    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(
            name="HQ", latitude=Decimal("46.5"), longitude=Decimal("6.6"),
            qr_code_token="t",
        )
        cls.alice = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site,
            home_lat=Decimal("46.580"), home_lon=Decimal("6.650"),
            standard_commute_minutes=15,
            weekly_target_hours=Decimal("40.00"),  # 8h / jour cible
        )
        cls.manager = UserProfile.objects.create_user(
            username="mgr", password="x", is_manager=True, home_site=cls.site,
        )

    def setUp(self):
        set_router_for_tests(_FixedRouter(45))  # trajet aller mission = 45 min
        # Mission FIELD à 45 min, sur 3 jours consécutifs.
        self.mission = Mission.objects.create(
            user=self.alice, mission_type=Mission.Type.FIELD,
            date_start=date(2026, 4, 20), date_end=date(2026, 4, 22),
            location_name="Client X",
            location_lat=Decimal("46.800"), location_lon=Decimal("7.150"),
        )
        self.mission.approve(self.manager)
        # Sanity : compensable bien snapshot à (45-15)*2 = 60 min.
        self.mission.refresh_from_db()
        assert self.mission.travel_minutes_compensable == 60

    def tearDown(self):
        reset_router_for_tests()

    def _session(self, day: date, h_start=9, h_end=17, mission=None):
        ci = datetime(day.year, day.month, day.day, h_start, 0, tzinfo=dt_tz.utc)
        co = datetime(day.year, day.month, day.day, h_end, 0, tzinfo=dt_tz.utc)
        return ClockSession.objects.create(
            user=self.alice, site=self.site, mission=mission or self.mission,
            clock_in=ci, clock_in_rounded=ci,
            clock_out=co, clock_out_rounded=co,
        )

    # ── compute_overtime ────────────────────────────────────────────────

    def test_overtime_includes_travel_compensable(self):
        """8h pointage + 60 min compensable A/R = 9h ; cible 8h → +1h overtime."""
        self._session(date(2026, 4, 20))
        delta = compute_overtime(self.alice, date(2026, 4, 20))
        # cible alice = 40/5 = 8h. Worked = 8h pointage + 1h trajet = 9h. Δ = +1h
        self.assertEqual(delta, Decimal("1.00"))

    def test_overtime_no_double_count_when_multiple_sessions_same_day(self):
        """2 sessions le même jour sur la MÊME mission → compensable compté
        UNE SEULE FOIS (un seul A/R par jour, peu importe le nb de sessions)."""
        self._session(date(2026, 4, 20), 9, 12)   # matin (3h)
        self._session(date(2026, 4, 20), 13, 17)  # aprem (4h)
        delta = compute_overtime(self.alice, date(2026, 4, 20))
        # 7h pointage + 1h trajet = 8h. Cible = 8h. Δ = 0.
        self.assertEqual(delta, Decimal("0.00"))

    def test_overtime_no_travel_for_remote_mission(self):
        """REMOTE : pas de déplacement → pas de compensable même si user a un home."""
        remote = Mission.objects.create(
            user=self.alice, mission_type=Mission.Type.REMOTE,
            date_start=date(2026, 4, 20), date_end=date(2026, 4, 20),
        )
        remote.approve(self.manager)
        self._session(date(2026, 4, 20), mission=remote)
        delta = compute_overtime(self.alice, date(2026, 4, 20))
        # 8h pile, pas de bonus. Δ = 0.
        self.assertEqual(delta, Decimal("0.00"))

    # ── DayDetailView ───────────────────────────────────────────────────

    def test_day_detail_view_includes_travel_compensable(self):
        self._session(date(2026, 4, 20))
        self.client.force_authenticate(self.alice)
        resp = self.client.get(
            reverse("clock-day"), {"date": "2026-04-20"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # 8h pointage + 60 min compensable = 540 min
        self.assertEqual(resp.data["total_minutes"], 540)
        # Et on expose le détail pour que l'UI puisse l'afficher.
        self.assertEqual(resp.data.get("travel_compensable_minutes"), 60)

    def test_day_detail_zero_travel_when_user_has_no_home(self):
        bob = UserProfile.objects.create_user(
            username="bob", password="x", home_site=self.site,
            # pas de home_lat/lon
        )
        m = Mission.objects.create(
            user=bob, mission_type=Mission.Type.FIELD,
            date_start=date(2026, 4, 20), date_end=date(2026, 4, 20),
            location_lat=Decimal("46.8"), location_lon=Decimal("7.1"),
        )
        m.approve(self.manager)
        ci = datetime(2026, 4, 20, 9, 0, tzinfo=dt_tz.utc)
        co = datetime(2026, 4, 20, 17, 0, tzinfo=dt_tz.utc)
        ClockSession.objects.create(
            user=bob, site=self.site, mission=m,
            clock_in=ci, clock_in_rounded=ci,
            clock_out=co, clock_out_rounded=co,
        )
        self.client.force_authenticate(bob)
        resp = self.client.get(reverse("clock-day"), {"date": "2026-04-20"})
        self.assertEqual(resp.data["total_minutes"], 480)  # juste pointage
        self.assertEqual(resp.data.get("travel_compensable_minutes"), 0)

    # ── UserMonthlyDetailView ───────────────────────────────────────────

    def test_monthly_detail_includes_travel_per_day(self):
        # 3 jours de mission → compensable doit être ajouté à CHAQUE jour.
        self._session(date(2026, 4, 20))
        self._session(date(2026, 4, 21))
        self._session(date(2026, 4, 22))
        self.client.force_authenticate(self.manager)
        resp = self.client.get(
            reverse("manager-report-user", kwargs={"user_id": self.alice.id}),
            {"month": "2026-04"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        days_by_date = {d["date"]: d for d in resp.data["days"]}
        # Chaque jour de mission : 480 + 60 = 540 min
        self.assertEqual(days_by_date["2026-04-20"]["worked_minutes"], 540)
        self.assertEqual(days_by_date["2026-04-21"]["worked_minutes"], 540)
        self.assertEqual(days_by_date["2026-04-22"]["worked_minutes"], 540)
        # Total mois : 3 × 540 = 1620 min
        self.assertEqual(resp.data["total_worked_minutes"], 1620)
        # Détail par jour exposé
        self.assertEqual(days_by_date["2026-04-20"].get("travel_compensable_minutes"), 60)

    # ── build_monthly_rows (rapport admin) ──────────────────────────────

    def test_monthly_report_row_includes_travel_for_period(self):
        self._session(date(2026, 4, 20))
        self._session(date(2026, 4, 21))
        rows = build_monthly_rows(
            UserProfile.objects.filter(pk=self.alice.id),
            date(2026, 4, 1), date(2026, 4, 30),
        )
        row = rows[0]
        # 2 jours × (480 + 60) = 1080 min = 18h
        self.assertEqual(row["worked_minutes"], 1080)
        self.assertEqual(row["worked_hours"], 18.0)
        # Champ dédié pour la transparence du rapport
        self.assertEqual(row.get("travel_compensable_minutes"), 120)  # 60 × 2 jours

    # ── MissionSerializer ───────────────────────────────────────────────

    def test_mission_time_spent_uses_per_day_compensable(self):
        # Mission de 3 jours, 1 session par jour → compensable × 3 jours.
        self._session(date(2026, 4, 20))
        self._session(date(2026, 4, 21))
        self._session(date(2026, 4, 22))
        data = MissionSerializer(self.mission).data
        # 3 × 480 pointage = 1440 min
        self.assertEqual(data["clocked_minutes"], 1440)
        # + 60 × 3 jours compensable = 1620 total
        self.assertEqual(data["time_spent_minutes"], 1620)

    # ── Cumul de plusieurs missions le même jour ────────────────────────

    def test_two_missions_same_day_compensables_sum(self):
        """Si l'employé enchaîne 2 missions FIELD différentes le même jour,
        les 2 compensables se cumulent (2 trajets A/R distincts)."""
        # 2ᵉ mission, 30 min de trajet (compensable = (30-15)*2 = 30 min)
        set_router_for_tests(_FixedRouter(30))
        m2 = Mission.objects.create(
            user=self.alice, mission_type=Mission.Type.FIELD,
            date_start=date(2026, 4, 20), date_end=date(2026, 4, 20),
            location_name="Client Y",
            location_lat=Decimal("46.700"), location_lon=Decimal("6.900"),
        )
        m2.approve(self.manager)
        # Session matin sur mission 1 (compensable=60), session aprem sur mission 2 (compensable=30)
        self._session(date(2026, 4, 20), 9, 12, mission=self.mission)
        self._session(date(2026, 4, 20), 14, 17, mission=m2)
        delta = compute_overtime(self.alice, date(2026, 4, 20))
        # Pointage : 3h + 3h = 6h. Trajets : 60+30 = 90 min = 1.5h. Total = 7.5h.
        # Cible = 8h → Δ = -0.5h
        self.assertEqual(delta, Decimal("-0.50"))
