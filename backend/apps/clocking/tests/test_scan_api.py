"""DRF integration tests for POST /api/clock/scan/."""
from datetime import date, time, timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clocking.models import ClockSession, FixedTimeSlot
from apps.missions.models import Mission
from apps.users.models import Site, ToleranceConfig, UserProfile

# A site at Notre-Dame, Paris.
SITE_LAT = 48.8530
SITE_LON = 2.3499


class ScanAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.url = reverse("clock-scan")
        # Disable rounding to keep test assertions deterministic.
        ToleranceConfig.objects.update_or_create(
            pk=1, defaults={"tolerance_minutes": 0, "rounding_direction": "NEAREST"},
        )

    def setUp(self):
        self.user = UserProfile.objects.create_user(username="alice", password="x")
        self.site = Site.objects.create(
            name="Siège Paris", latitude=SITE_LAT, longitude=SITE_LON,
            qr_code_token="site-token-abc", gps_radius_meters=150,
        )
        self.client.force_authenticate(self.user)

    # ── 1. Valid scan in radius ────────────────────────────────────────
    def test_scan_in_radius_creates_clock_in(self):
        resp = self.client.post(self.url, {
            "qr_token": "site-token-abc",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["action"], "IN")
        self.assertIsNone(resp.data["clock_out"])
        self.assertEqual(ClockSession.objects.filter(user=self.user).count(), 1)

    # ── 2. Out of range → 403 with exact distance ──────────────────────
    def test_scan_out_of_range_returns_403_with_distance(self):
        # ~1.5 km north of site (well outside 150 m radius).
        resp = self.client.post(self.url, {
            "qr_token": "site-token-abc",
            "gps_lat": SITE_LAT + 0.01350, "gps_lon": SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "GPS_OUT_OF_RANGE")
        self.assertEqual(resp.data["allowed_m"], 150)
        # 0.0135° lat ≈ 1500 m.
        self.assertGreater(resp.data["distance_m"], 1400)
        self.assertLess(resp.data["distance_m"], 1600)
        self.assertFalse(ClockSession.objects.exists())

    # ── 3. Unknown token → 404 ─────────────────────────────────────────
    def test_unknown_token_returns_404(self):
        resp = self.client.post(self.url, {
            "qr_token": "does-not-exist",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data["error"], "TOKEN_NOT_FOUND")

    # ── 4. Outside fixed slot → 200 + requires_justification ───────────
    def test_outside_fixed_slot_requires_justification(self):
        # Create a slot starting at 00:01 — any current time is "after" the start.
        FixedTimeSlot.objects.create(
            name="Matin", start_time=time(0, 1), end_time=time(23, 59),
        )
        resp = self.client.post(self.url, {
            "qr_token": "site-token-abc",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data.get("requires_justification"))
        self.assertEqual(resp.data["action"], "IN")
        # No session should be created until justification is supplied.
        self.assertFalse(ClockSession.objects.exists())

        # Now retry with a justification — session is created.
        resp2 = self.client.post(self.url, {
            "qr_token": "site-token-abc",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
            "justification": "RDV médical en début de matinée",
        }, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(ClockSession.objects.count(), 1)
        self.assertIn("médical", ClockSession.objects.get().justification)

    # ── 5. Mission token expired → 403 ─────────────────────────────────
    def test_expired_mission_token_returns_403(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        mission = Mission.objects.create(
            user=self.user, mission_type="REMOTE",
            date_start=yesterday - timedelta(days=2),
            date_end=yesterday,  # ended yesterday
            status=Mission.Status.APPROVED,
            qr_token="mission-token-xyz",
        )
        resp = self.client.post(self.url, {
            "qr_token": "mission-token-xyz",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "MISSION_EXPIRED")

    # ── Bonus: mission scan within validity, REMOTE → no GPS check ─────
    def test_remote_mission_within_validity_creates_session(self):
        today = timezone.localdate()
        mission = Mission.objects.create(
            user=self.user, mission_type="REMOTE",
            date_start=today, date_end=today,
            status=Mission.Status.APPROVED,
            qr_token="mission-token-remote",
        )
        resp = self.client.post(self.url, {
            "qr_token": "mission-token-remote",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["action"], "IN")
        session = ClockSession.objects.get()
        self.assertEqual(session.session_type, "MISSION")
        self.assertEqual(session.mission_id, mission.id)

    # ── Bonus: mission token belongs to another user → 403 ─────────────
    def test_mission_token_for_other_user_returns_403(self):
        other = UserProfile.objects.create_user(username="bob", password="x")
        Mission.objects.create(
            user=other, mission_type="REMOTE",
            date_start=timezone.localdate(), date_end=timezone.localdate(),
            status=Mission.Status.APPROVED,
            qr_token="bobs-token",
        )
        resp = self.client.post(self.url, {"qr_token": "bobs-token"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "MISSION_FORBIDDEN")

    # ── Bonus: second scan closes the session ──────────────────────────
    def test_second_scan_closes_session_and_returns_OUT(self):
        self.client.post(self.url, {
            "qr_token": "site-token-abc",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
        }, format="json")
        resp = self.client.post(self.url, {
            "qr_token": "site-token-abc",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["action"], "OUT")
        self.assertIsNotNone(resp.data["clock_out"])

    # ── Bonus: unauthenticated → 401 ───────────────────────────────────
    def test_unauthenticated_request_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(self.url, {
            "qr_token": "site-token-abc",
            "gps_lat": SITE_LAT, "gps_lon": SITE_LON,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
