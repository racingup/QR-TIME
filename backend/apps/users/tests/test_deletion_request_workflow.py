"""Workflow LPD demande de suppression de compte (Art. 32 al. 2).

Vérifie le cycle complet :
  1. L'employé crée une demande (PENDING)
  2. Le compte reste INTACT tant que l'admin n'a pas tranché
  3. L'admin liste les demandes (inbox RH)
  4. L'admin approuve → anonymisation effective + demande FULFILLED
  5. L'admin refuse → demande REJECTED, compte intact

Anti-patterns testés :
  - Pas de doublon PENDING par user
  - Pas de décision sur une demande déjà tranchée
  - Pas d'auto-décision (un superuser ne décide pas sur sa propre demande)
  - Un manager non-superuser ne peut pas accéder à l'inbox admin
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import (
    AdminAuditLog, DataDeletionRequest, UserProfile,
)


class DeletionRequestUserSideTests(APITestCase):
    """Côté employé : POST création + GET ma demande active."""

    def setUp(self):
        self.alice = UserProfile.objects.create_user(
            username="alice", password="x", email="a@x",
        )
        self.client.force_authenticate(self.alice)

    def test_get_returns_null_when_no_request(self):
        resp = self.client.get(reverse("me-deletion-request"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data["pending"])

    def test_post_creates_pending_request(self):
        resp = self.client.post(
            reverse("me-deletion-request"),
            {"confirm": "DELETE", "reason": "Je quitte l'entreprise"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["pending"]["status"], "PENDING")
        self.assertEqual(
            resp.data["pending"]["user_reason"], "Je quitte l'entreprise",
        )
        # Et le compte reste actif !
        self.alice.refresh_from_db()
        self.assertTrue(self.alice.is_active)
        self.assertEqual(self.alice.username, "alice")

    def test_post_writes_audit_log(self):
        self.client.post(
            reverse("me-deletion-request"),
            {"confirm": "DELETE"}, format="json",
        )
        entry = AdminAuditLog.objects.filter(
            action=AdminAuditLog.Action.DELETION_REQUEST_CREATED,
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor_id, self.alice.id)
        self.assertEqual(entry.target_user_id, self.alice.id)

    def test_get_returns_existing_pending(self):
        DataDeletionRequest.objects.create(
            user=self.alice, user_reason="motif",
        )
        resp = self.client.get(reverse("me-deletion-request"))
        self.assertEqual(resp.data["pending"]["status"], "PENDING")
        self.assertEqual(resp.data["pending"]["user_reason"], "motif")

    def test_no_double_pending(self):
        DataDeletionRequest.objects.create(user=self.alice)
        resp = self.client.post(
            reverse("me-deletion-request"),
            {"confirm": "DELETE"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data["error"], "ALREADY_PENDING")

    def test_requires_confirm(self):
        resp = self.client.post(
            reverse("me-deletion-request"), {}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_superuser_cannot_create(self):
        chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )
        self.client.force_authenticate(chief)
        resp = self.client.post(
            reverse("me-deletion-request"),
            {"confirm": "DELETE"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class DeletionRequestAdminSideTests(APITestCase):
    """Côté admin : inbox + décision."""

    def setUp(self):
        self.alice = UserProfile.objects.create_user(username="alice", password="x")
        self.bob = UserProfile.objects.create_user(username="bob", password="x")
        self.chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )
        self.regular_mgr = UserProfile.objects.create_user(
            username="mgr", password="x", is_manager=True,
        )

    def _create_request(self, user, reason="motif"):
        return DataDeletionRequest.objects.create(user=user, user_reason=reason)

    def test_admin_lists_requests(self):
        self._create_request(self.alice, "alice motif")
        self._create_request(self.bob, "bob motif")
        self.client.force_authenticate(self.chief)
        resp = self.client.get(reverse("admin-deletion-requests"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)
        usernames = {r["username"] for r in resp.data["results"]}
        self.assertEqual(usernames, {"alice", "bob"})

    def test_admin_filters_by_status(self):
        r1 = self._create_request(self.alice)
        r2 = self._create_request(self.bob)
        # Marque r2 comme rejected manuellement
        r2.status = DataDeletionRequest.Status.REJECTED
        r2.save()
        self.client.force_authenticate(self.chief)
        resp = self.client.get(reverse("admin-deletion-requests"), {"status": "PENDING"})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["id"], r1.id)

    def test_regular_manager_blocked_from_admin_inbox(self):
        self.client.force_authenticate(self.regular_mgr)
        resp = self.client.get(reverse("admin-deletion-requests"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_approve_anonymizes_user_and_writes_audit(self):
        req = self._create_request(self.alice, "départ")
        original_id = self.alice.id
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(
            reverse("admin-deletion-request-decide", kwargs={"pk": req.id}),
            {"decision": "approve", "comment": "STC effectué le 30/04"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")
        # Anonymisation effective
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.id, original_id)         # FK préservée
        self.assertEqual(self.alice.username, "deleted_1")   # anonymisé
        self.assertFalse(self.alice.is_active)
        # Audit
        entry = AdminAuditLog.objects.filter(
            action=AdminAuditLog.Action.DELETION_REQUEST_APPROVED,
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor_id, self.chief.id)
        # decided_by préservé
        req.refresh_from_db()
        self.assertEqual(req.decided_by_id, self.chief.id)
        self.assertEqual(req.admin_comment, "STC effectué le 30/04")

    def test_reject_keeps_user_intact(self):
        req = self._create_request(self.alice)
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(
            reverse("admin-deletion-request-decide", kwargs={"pk": req.id}),
            {"decision": "reject", "comment": "Procédure SIRH déjà en cours"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "REJECTED")
        # Compte INTACT
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.username, "alice")
        self.assertTrue(self.alice.is_active)

    def test_cannot_decide_twice(self):
        req = self._create_request(self.alice)
        req.status = DataDeletionRequest.Status.REJECTED
        req.save()
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(
            reverse("admin-deletion-request-decide", kwargs={"pk": req.id}),
            {"decision": "approve"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data["error"], "ALREADY_DECIDED")

    def test_invalid_decision_rejected(self):
        req = self._create_request(self.alice)
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(
            reverse("admin-deletion-request-decide", kwargs={"pk": req.id}),
            {"decision": "maybe"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
