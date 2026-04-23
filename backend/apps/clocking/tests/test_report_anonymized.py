"""Le rapport mensuel doit conserver les lignes des utilisateurs anonymisés
(`deleted_N`, is_active=False) qui ont des sessions sur la période.

Justification : OLT 1 Art. 73 — l'enregistrement du temps de travail doit
être conservé même après le départ d'un collaborateur ; LPD Art. 32 al. 2 —
le compte est pseudonymisé, pas effacé.
"""
from datetime import date, datetime, timezone as dt_tz

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clocking.models import ClockSession
from apps.users.models import Site, UserProfile
from services.audit import anonymize_user


class MonthlyReportAnonymizedTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(name="HQ", latitude=0, longitude=0, qr_code_token="t")
        cls.alice = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site,
        )
        cls.bob = UserProfile.objects.create_user(
            username="bob", password="x", home_site=cls.site,
        )
        cls.mgr = UserProfile.objects.create_user(
            username="mgr", password="x", is_manager=True, home_site=cls.site,
        )
        cls.chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )

    def _session(self, user, day: date, h_start=9, h_end=17):
        ci = datetime(day.year, day.month, day.day, h_start, 0, tzinfo=dt_tz.utc)
        co = datetime(day.year, day.month, day.day, h_end, 0, tzinfo=dt_tz.utc)
        return ClockSession.objects.create(
            user=user, site=self.site,
            clock_in=ci, clock_in_rounded=ci,
            clock_out=co, clock_out_rounded=co,
        )

    def test_anonymized_user_with_data_appears_in_report(self):
        # Bob a 2 sessions en avril 2026, puis demande la suppression.
        self._session(self.bob, date(2026, 4, 2))
        self._session(self.bob, date(2026, 4, 3))
        bob_id = self.bob.id
        anonymize_user(self.bob)
        self.bob.refresh_from_db()
        self.assertEqual(self.bob.username, "deleted_1")  # sanity

        self.client.force_authenticate(self.mgr)
        resp = self.client.get(reverse("manager-report"), {"month": "2026-04"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = {r["user_id"]: r for r in resp.data["rows"]}
        # Bob (anonymisé) doit être présent avec son id préservé et le username deleted_1.
        self.assertIn(bob_id, rows)
        self.assertEqual(rows[bob_id]["username"], "deleted_1")
        self.assertEqual(rows[bob_id]["sessions_count"], 2)

    def test_anonymized_user_without_data_excluded_from_report(self):
        # Bob est anonymisé mais n'a aucune session sur le mois consulté.
        anonymize_user(self.bob)
        self.client.force_authenticate(self.mgr)
        resp = self.client.get(reverse("manager-report"), {"month": "2026-04"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        usernames = {r["username"] for r in resp.data["rows"]}
        self.assertNotIn("deleted_1", usernames)

    def test_admin_sees_anonymized_across_all_sites(self):
        other_site = Site.objects.create(
            name="Branch", latitude=0, longitude=0, qr_code_token="tb",
        )
        nina = UserProfile.objects.create_user(
            username="nina", password="x", home_site=other_site,
        )
        nina_id = nina.id
        ci = datetime(2026, 4, 5, 8, 0, tzinfo=dt_tz.utc)
        co = datetime(2026, 4, 5, 16, 0, tzinfo=dt_tz.utc)
        ClockSession.objects.create(
            user=nina, site=other_site,
            clock_in=ci, clock_in_rounded=ci,
            clock_out=co, clock_out_rounded=co,
        )
        anonymize_user(nina)
        self.client.force_authenticate(self.chief)
        resp = self.client.get(reverse("manager-report"), {"month": "2026-04"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {r["user_id"] for r in resp.data["rows"]}
        self.assertIn(nina_id, ids)

    def test_user_id_present_in_every_row(self):
        # Régression : la cle `user_id` est toujours sérialisée — l'admin doit
        # pouvoir l'afficher pour distinguer plusieurs `deleted_N`.
        self._session(self.alice, date(2026, 4, 1))
        self.client.force_authenticate(self.mgr)
        resp = self.client.get(reverse("manager-report"), {"month": "2026-04"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for row in resp.data["rows"]:
            self.assertIn("user_id", row)
            self.assertIsInstance(row["user_id"], int)
