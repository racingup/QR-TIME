"""Suppression d'un ClockSession par un manager / admin.

Règles vérifiées :
  - Manager du même site supprime → 204, ligne effacée, audit écrit.
  - Manager hors-scope (autre site) → 403, ligne intouchée.
  - Manager s'auto-supprime (anti-self) → 403.
  - Superuser peut supprimer un pointage de superuser.
  - Manager non-superuser ne peut PAS supprimer un pointage de superuser.
  - Snapshot de la session figé dans `AdminAuditLog.details`.
  - Garde-fou PATCH : `{"clock_in": null}` → 400 (pas 500), pointe vers DELETE.
"""
from datetime import datetime, timezone as dt_tz
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clocking.models import ClockSession
from apps.users.models import AdminAuditLog, Site, UserProfile


class SessionDeleteTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.site_a = Site.objects.create(
            name="A", latitude=Decimal("46.5"), longitude=Decimal("6.6"),
            qr_code_token="ta",
        )
        cls.site_b = Site.objects.create(
            name="B", latitude=Decimal("47.0"), longitude=Decimal("7.0"),
            qr_code_token="tb",
        )
        cls.alice = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site_a,
        )
        cls.bob = UserProfile.objects.create_user(
            username="bob", password="x", home_site=cls.site_b,
        )
        cls.mgr_a = UserProfile.objects.create_user(
            username="mgr_a", password="x", is_manager=True, home_site=cls.site_a,
        )
        cls.chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )

    def _session(self, user, site):
        ci = datetime(2026, 4, 22, 9, 0, tzinfo=dt_tz.utc)
        co = datetime(2026, 4, 22, 17, 0, tzinfo=dt_tz.utc)
        return ClockSession.objects.create(
            user=user, site=site,
            clock_in=ci, clock_in_rounded=ci,
            clock_out=co, clock_out_rounded=co,
        )

    def test_manager_can_delete_session_in_scope(self):
        s = self._session(self.alice, self.site_a)
        self.client.force_authenticate(self.mgr_a)
        url = reverse("clock-delete", kwargs={"pk": s.id})
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ClockSession.objects.filter(pk=s.id).exists())

    def test_audit_log_written_with_session_snapshot(self):
        s = self._session(self.alice, self.site_a)
        self.client.force_authenticate(self.mgr_a)
        self.client.delete(reverse("clock-delete", kwargs={"pk": s.id}))
        entry = AdminAuditLog.objects.filter(
            action=AdminAuditLog.Action.SESSION_DELETE,
        ).order_by("-created_at").first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor_id, self.mgr_a.id)
        self.assertEqual(entry.target_user_id, self.alice.id)
        self.assertEqual(entry.object_type, "ClockSession")
        self.assertEqual(entry.object_id, str(s.id))
        # Snapshot conservé même après suppression de la ligne.
        self.assertEqual(entry.details["session_type"], s.session_type)
        self.assertIn("clock_in", entry.details)

    def test_manager_cannot_delete_out_of_scope(self):
        # Bob est sur site B, mgr_a ne le voit pas.
        s = self._session(self.bob, self.site_b)
        self.client.force_authenticate(self.mgr_a)
        resp = self.client.delete(reverse("clock-delete", kwargs={"pk": s.id}))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ClockSession.objects.filter(pk=s.id).exists())

    def test_manager_cannot_delete_own_session(self):
        # Anti-self : un manager ne supprime jamais ses propres pointages.
        s = self._session(self.mgr_a, self.site_a)
        self.client.force_authenticate(self.mgr_a)
        resp = self.client.delete(reverse("clock-delete", kwargs={"pk": s.id}))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ClockSession.objects.filter(pk=s.id).exists())

    def test_manager_cannot_delete_superuser_session(self):
        # Hiérarchie : un manager non-superuser ne touche pas un superuser.
        s = self._session(self.chief, self.site_a)
        self.client.force_authenticate(self.mgr_a)
        resp = self.client.delete(reverse("clock-delete", kwargs={"pk": s.id}))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ClockSession.objects.filter(pk=s.id).exists())

    def test_superuser_can_delete_anything(self):
        # Superuser peut tout, y compris ses propres pointages.
        s = self._session(self.chief, self.site_a)
        self.client.force_authenticate(self.chief)
        resp = self.client.delete(reverse("clock-delete", kwargs={"pk": s.id}))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ClockSession.objects.filter(pk=s.id).exists())

    def test_employee_cannot_delete(self):
        # Un employé n'a même pas la permission IsManager → 403.
        s = self._session(self.alice, self.site_a)
        self.client.force_authenticate(self.alice)
        resp = self.client.delete(reverse("clock-delete", kwargs={"pk": s.id}))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ClockSession.objects.filter(pk=s.id).exists())


class SessionEditNullClockInGuardTests(APITestCase):
    """L'edit ne doit PAS planter en 500 si on tente de vider clock_in.
    Il doit renvoyer 400 avec un message clair pointant vers DELETE."""

    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(
            name="HQ", latitude=Decimal("46.5"), longitude=Decimal("6.6"),
            qr_code_token="t",
        )
        cls.alice = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site,
        )
        cls.mgr = UserProfile.objects.create_user(
            username="mgr", password="x", is_manager=True, home_site=cls.site,
        )

    def test_patch_with_null_clock_in_returns_400_not_500(self):
        ci = datetime(2026, 4, 22, 9, 0, tzinfo=dt_tz.utc)
        s = ClockSession.objects.create(
            user=self.alice, site=self.site,
            clock_in=ci, clock_in_rounded=ci,
        )
        self.client.force_authenticate(self.mgr)
        resp = self.client.patch(
            reverse("clock-edit", kwargs={"pk": s.id}),
            {"clock_in": None}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["error"], "CLOCK_IN_REQUIRED")
        self.assertIn("DELETE", resp.data["hint"])
        # Et la session est intacte.
        s.refresh_from_db()
        self.assertEqual(s.clock_in, ci)
