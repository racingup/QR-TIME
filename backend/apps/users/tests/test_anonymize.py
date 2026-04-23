"""Tests for the user anonymization flow (LPD Art. 32 al. 2 + OLT 1 Art. 73).

Règles vérifiées :
  - L'`id` interne est PRÉSERVÉ après anonymisation (les FKs survivent).
  - Le username devient `deleted_N`, monotone (1, 2, 3, ...).
  - Le compte est désactivé, email/nom vidés, mot de passe inutilisable.
  - L'endpoint self-delete refuse sans confirmation explicite.
  - Le superuser ne peut pas s'auto-supprimer.
"""
from django.contrib.auth.hashers import is_password_usable
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import UserProfile
from services.audit import anonymize_user


class AnonymizeHelperTests(TestCase):
    def test_anonymize_renames_to_deleted_1_first(self):
        u = UserProfile.objects.create_user(username="alice", password="x", email="a@x")
        original_id = u.id
        anonymize_user(u)
        u.refresh_from_db()
        self.assertEqual(u.id, original_id)              # id préservé
        self.assertEqual(u.username, "deleted_1")        # premier deleted
        self.assertEqual(u.email, "")
        self.assertEqual(u.first_name, "")
        self.assertEqual(u.last_name, "")
        self.assertFalse(u.is_active)
        self.assertFalse(is_password_usable(u.password))

    def test_anonymize_increments_monotonically(self):
        a = UserProfile.objects.create_user(username="a", password="x")
        b = UserProfile.objects.create_user(username="b", password="x")
        c = UserProfile.objects.create_user(username="c", password="x")
        anonymize_user(a)
        anonymize_user(b)
        anonymize_user(c)
        a.refresh_from_db(); b.refresh_from_db(); c.refresh_from_db()
        self.assertEqual(a.username, "deleted_1")
        self.assertEqual(b.username, "deleted_2")
        self.assertEqual(c.username, "deleted_3")

    def test_anonymize_resumes_after_existing_deleted(self):
        # Si un `deleted_5` existe déjà, le suivant doit être `deleted_6`.
        UserProfile.objects.create_user(
            username="deleted_5", password="x", is_active=False,
        )
        u = UserProfile.objects.create_user(username="newcomer", password="x")
        anonymize_user(u)
        u.refresh_from_db()
        self.assertEqual(u.username, "deleted_6")

    def test_anonymize_preserves_foreign_keys(self):
        from apps.missions.models import Mission
        from datetime import date
        u = UserProfile.objects.create_user(username="zoe", password="x")
        m = Mission.objects.create(
            user=u, mission_type="FIELD",
            date_start=date.today(), date_end=date.today(),
        )
        original_user_id = u.id
        anonymize_user(u)
        m.refresh_from_db()
        self.assertEqual(m.user_id, original_user_id)    # FK intacte
        self.assertEqual(m.user.username, "deleted_1")   # rattaché à l'anon


class SelfDeleteEndpointTests(APITestCase):
    def setUp(self):
        self.user = UserProfile.objects.create_user(username="alice", password="x", email="a@x")
        self.client.force_authenticate(self.user)

    def test_requires_confirm_payload(self):
        resp = self.client.post(reverse("me-delete"), {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["error"], "CONFIRMATION_REQUIRED")
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "alice")     # rien ne bouge

    def test_self_delete_creates_pending_request_does_NOT_anonymize(self):
        # Nouveau workflow LPD : la POST /me/delete-account/ ne supprime PLUS
        # directement (qui équivaudrait à un licenciement). Elle crée une
        # demande PENDING que l'admin/RH doit valider.
        original_id = self.user.id
        original_username = self.user.username
        resp = self.client.post(
            reverse("me-delete"),
            {"confirm": "DELETE"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("pending", resp.data)
        self.assertEqual(resp.data["pending"]["status"], "PENDING")
        # Le compte est INTACT — l'employé continue à pouvoir se connecter.
        self.user.refresh_from_db()
        self.assertEqual(self.user.id, original_id)
        self.assertEqual(self.user.username, original_username)
        self.assertTrue(self.user.is_active)

    def test_superuser_cannot_self_delete(self):
        chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )
        self.client.force_authenticate(chief)
        resp = self.client.post(
            reverse("me-delete"),
            {"confirm": "DELETE"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
