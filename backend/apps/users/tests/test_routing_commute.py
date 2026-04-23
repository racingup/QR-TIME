"""Tests du service routing + du recalcul auto du trajet standard.

Couverture :
  - `compensable_round_trip_minutes` : la formule (Art. 13 al. 3 OLT 1)
  - `Router` mock + cache hit + fail-open sur erreur réseau
  - `AdminUserViewSet.perform_update` : recalcul auto si l'adresse OU le site
    change ; respect du override manuel ; pas de recalcul sur changement
    d'autres champs (email, etc.)
"""
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import Site, UserProfile
from services.routing import (
    ORSRouter, Router,
    compensable_round_trip_minutes,
    compute_commute_minutes,
    reset_router_for_tests,
    set_router_for_tests,
)


# ── Mock Router pour ne pas dépendre du vrai ORS dans les tests ──────────


class _MockRouter(Router):
    """Renvoie une valeur fixe configurable + compte les appels."""

    def __init__(self, fixed_minutes=15):
        self.fixed_minutes = fixed_minutes
        self.calls = []

    def compute_minutes(self, from_lat, from_lon, to_lat, to_lon):
        self.calls.append((from_lat, from_lon, to_lat, to_lon))
        return self.fixed_minutes


class CompensableFormulaTests(TestCase):
    """Vérifie l'arithmétique du temps de trajet compensable (Art. 13 OLT 1)."""

    def test_normal_case_round_trip_minus_standard(self):
        # actual=45 min aller, standard=15 min aller
        # → (45 − 15) × 2 = 60 min A/R compensable
        self.assertEqual(compensable_round_trip_minutes(45, 15), 60)

    def test_mission_closer_than_site_returns_zero(self):
        # actual=10 < standard=15 → trajet "économisé", jamais négatif.
        self.assertEqual(compensable_round_trip_minutes(10, 15), 0)

    def test_mission_at_same_distance_returns_zero(self):
        self.assertEqual(compensable_round_trip_minutes(15, 15), 0)

    def test_no_standard_credits_full_round_trip(self):
        # Si le user n'a pas de trajet standard défini, on est conservateur :
        # on crédite la totalité du trajet pro A/R (soit 2× actual).
        self.assertEqual(compensable_round_trip_minutes(30, None), 60)

    def test_no_actual_returns_none(self):
        # Pas de calcul possible (domicile manquant, ORS HS) → None.
        self.assertIsNone(compensable_round_trip_minutes(None, 15))


class ORSRouterTests(TestCase):
    """Smoke tests sur l'adaptateur ORS (mock HTTP)."""

    def setUp(self):
        cache.clear()

    def test_no_api_key_returns_none(self):
        r = ORSRouter(api_key="")
        self.assertIsNone(r.compute_minutes(46.5, 6.6, 46.6, 6.7))

    def test_identical_points_short_circuit_to_zero(self):
        # Pas d'appel HTTP même sans clé.
        r = ORSRouter(api_key="x")
        self.assertEqual(r.compute_minutes(46.5, 6.6, 46.5, 6.6), 0)

    @patch("services.routing.requests.post")
    def test_successful_call_parses_minutes(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "routes": [{"summary": {"duration": 1800.0}}],  # 30 min
        }
        r = ORSRouter(api_key="dummy")
        self.assertEqual(r.compute_minutes(46.5, 6.6, 46.6, 6.7), 30)

    @patch("services.routing.requests.post")
    def test_http_error_returns_none(self, mock_post):
        mock_post.return_value.status_code = 503
        mock_post.return_value.text = "service unavailable"
        r = ORSRouter(api_key="dummy")
        self.assertIsNone(r.compute_minutes(46.5, 6.6, 46.6, 6.7))

    @patch("services.routing.requests.post")
    def test_network_exception_returns_none(self, mock_post):
        mock_post.side_effect = Exception("connection reset")
        r = ORSRouter(api_key="dummy")
        self.assertIsNone(r.compute_minutes(46.5, 6.6, 46.6, 6.7))

    @patch("services.routing.requests.post")
    def test_cache_avoids_second_call(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "routes": [{"summary": {"duration": 600.0}}],  # 10 min
        }
        r = ORSRouter(api_key="dummy")
        a = r.compute_minutes(46.5, 6.6, 46.6, 6.7)
        b = r.compute_minutes(46.5, 6.6, 46.6, 6.7)
        self.assertEqual(a, 10)
        self.assertEqual(b, 10)
        self.assertEqual(mock_post.call_count, 1)  # 2ᵉ appel servi par le cache


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class AdminUserCommuteRecalcTests(APITestCase):
    """L'endpoint admin recalcule le trajet standard quand l'adresse change."""

    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(
            name="Lausanne", latitude=Decimal("46.519"),
            longitude=Decimal("6.633"), qr_code_token="t1",
        )
        cls.other_site = Site.objects.create(
            name="Genève", latitude=Decimal("46.204"),
            longitude=Decimal("6.143"), qr_code_token="t2",
        )
        cls.admin = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )
        cls.alice = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site,
        )

    def setUp(self):
        cache.clear()
        self._mock = _MockRouter(fixed_minutes=22)
        set_router_for_tests(self._mock)
        self.client.force_authenticate(self.admin)

    def tearDown(self):
        reset_router_for_tests()

    def _patch_user(self, **fields):
        return self.client.patch(
            f"/api/admin/users/{self.alice.id}/", fields, format="json",
        )

    def test_setting_home_address_triggers_commute_calc(self):
        resp = self._patch_user(home_lat="46.5800", home_lon="6.6500")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.standard_commute_minutes, 22)
        self.assertEqual(len(self._mock.calls), 1)

    def test_changing_site_triggers_recalc(self):
        # Pré-condition : adresse domicile + commute déjà définis.
        self.alice.home_lat = Decimal("46.5800")
        self.alice.home_lon = Decimal("6.6500")
        self.alice.standard_commute_minutes = 18
        self.alice.save()

        self._mock.fixed_minutes = 55  # Genève est plus loin
        resp = self._patch_user(home_site=self.other_site.id)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.standard_commute_minutes, 55)

    def test_unrelated_field_does_not_trigger_recalc(self):
        self.alice.home_lat = Decimal("46.5800")
        self.alice.home_lon = Decimal("6.6500")
        self.alice.standard_commute_minutes = 18
        self.alice.save()

        resp = self._patch_user(email="newmail@example.com")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.standard_commute_minutes, 18)
        self.assertEqual(len(self._mock.calls), 0)

    def test_admin_manual_override_skips_recalc(self):
        # L'admin envoie EN MEME TEMPS lat/lon ET standard_commute_minutes
        # → on respecte sa valeur manuelle, pas de recalcul.
        resp = self._patch_user(
            home_lat="46.5800", home_lon="6.6500",
            standard_commute_minutes=99,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.standard_commute_minutes, 99)
        self.assertEqual(len(self._mock.calls), 0)

    def test_router_failure_keeps_previous_commute_value(self):
        # Pré-condition : commute déjà à 18 min.
        self.alice.home_lat = Decimal("46.5800")
        self.alice.home_lon = Decimal("6.6500")
        self.alice.standard_commute_minutes = 18
        self.alice.save()

        # Router renvoie None (ORS HS, quota dépassé, etc.)
        class _DeadRouter(Router):
            def compute_minutes(self, *a, **kw): return None
        set_router_for_tests(_DeadRouter())

        resp = self._patch_user(home_lat="46.7000", home_lon="6.9000")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.alice.refresh_from_db()
        # Fail-open : ancienne valeur préservée.
        self.assertEqual(self.alice.standard_commute_minutes, 18)


class ComputeCommuteHelperTests(TestCase):
    """compute_commute_minutes()` — bons garde-fous sur les pré-conditions."""

    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(
            name="HQ", latitude=Decimal("46.5"), longitude=Decimal("6.6"),
            qr_code_token="t",
        )

    def setUp(self):
        set_router_for_tests(_MockRouter(fixed_minutes=12))

    def tearDown(self):
        reset_router_for_tests()

    def test_returns_none_if_no_home_address(self):
        u = UserProfile.objects.create_user(
            username="noaddr", password="x", home_site=self.site,
        )
        self.assertIsNone(compute_commute_minutes(u))

    def test_returns_none_if_no_home_site(self):
        u = UserProfile.objects.create_user(
            username="nosite", password="x",
            home_lat=Decimal("46.6"), home_lon=Decimal("6.7"),
        )
        self.assertIsNone(compute_commute_minutes(u))

    def test_happy_path(self):
        u = UserProfile.objects.create_user(
            username="ok", password="x", home_site=self.site,
            home_lat=Decimal("46.6"), home_lon=Decimal("6.7"),
        )
        self.assertEqual(compute_commute_minutes(u), 12)
