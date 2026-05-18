"""Régression tests pour les bugs corrigés (commit fd0d223) — partie users.

Couvre :
  - B2 : Signal post_save sur ConsentWithdrawalRequest crée le ConsentLog inverse
        à la transition PENDING → APPROVED (via ORM, simule admin natif Django).
  - D7 : Le serializer rejette un manager FK qui n'est pas is_manager.
  - D9 : Retrait PRIVACY_POLICY approuvé → must_accept_consent=True.
"""
from __future__ import annotations

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import ConsentLog, ConsentWithdrawalRequest, UserProfile


class B2ConsentWithdrawalSignalTests(TestCase):
    """B2 — Le signal post_save crée le ConsentLog inverse à l'approbation.

    On simule le chemin "admin natif Django" en passant par l'ORM direct
    (pas l'API). Le signal doit malgré tout déclencher la création du log.
    """

    def setUp(self):
        self.user = UserProfile.objects.create_user(username="b2-user", password="x")

    def test_orm_status_change_creates_consent_log_revocation(self):
        # 1. Création de la demande en PENDING — pas de log inverse.
        req = ConsentWithdrawalRequest.objects.create(
            user=self.user,
            kind=ConsentWithdrawalRequest.Kind.GPS,
            status=ConsentWithdrawalRequest.Status.PENDING,
        )
        self.assertFalse(
            ConsentLog.objects.filter(
                user=self.user, kind="GPS", granted=False,
            ).exists(),
            "PENDING ne doit pas créer de ConsentLog inverse",
        )

        # 2. Transition PENDING → APPROVED via ORM (équivalent admin natif).
        req.status = ConsentWithdrawalRequest.Status.APPROVED
        req.save()

        # 3. Le ConsentLog inverse doit exister.
        log = ConsentLog.objects.filter(
            user=self.user, kind="GPS", granted=False,
        ).first()
        self.assertIsNotNone(
            log,
            "Signal post_save doit créer un ConsentLog(granted=False) à l'approbation",
        )

    def test_signal_idempotent_no_duplicate_on_resave(self):
        """Sauver à nouveau un APPROVED ne doit pas créer un 2e log."""
        req = ConsentWithdrawalRequest.objects.create(
            user=self.user,
            kind=ConsentWithdrawalRequest.Kind.STORAGE,
            status=ConsentWithdrawalRequest.Status.PENDING,
        )
        req.status = ConsentWithdrawalRequest.Status.APPROVED
        req.save()
        count_after_first = ConsentLog.objects.filter(
            user=self.user, kind="STORAGE", granted=False,
        ).count()
        # Re-save sans transition — doit rester idempotent.
        req.save()
        count_after_resave = ConsentLog.objects.filter(
            user=self.user, kind="STORAGE", granted=False,
        ).count()
        self.assertEqual(count_after_first, count_after_resave)


class D7ManagerFKValidationTests(TestCase):
    """D7 — On ne peut pas désigner comme manager un user sans is_manager=True."""

    def setUp(self):
        self.client = APIClient()
        self.superuser = UserProfile.objects.create_superuser(
            username="d7-root", password="x", email="root@example.com",
        )
        self.alice = UserProfile.objects.create_user(username="d7-alice", password="x")
        self.bob = UserProfile.objects.create_user(
            username="d7-bob", password="x", is_manager=False,
        )

    def test_patch_with_non_manager_as_manager_returns_validation_error(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.patch(
            f"/api/admin/users/{self.alice.id}/",
            {"manager": self.bob.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        msg = str(resp.data)
        self.assertIn(
            "manager", msg.lower(),
            f"Le message d'erreur doit mentionner 'manager', got: {msg}",
        )

    def test_patch_with_manager_user_as_manager_succeeds(self):
        """Sanity-check : un vrai manager peut être désigné."""
        carol = UserProfile.objects.create_user(
            username="d7-carol", password="x", is_manager=True,
        )
        self.client.force_authenticate(self.superuser)
        resp = self.client.patch(
            f"/api/admin/users/{self.alice.id}/",
            {"manager": carol.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.manager_id, carol.id)


class D9PrivacyPolicyWithdrawalForcesReconsentTests(TestCase):
    """D9 — Retrait du consentement PRIVACY_POLICY remet must_accept_consent à True."""

    def setUp(self):
        self.user = UserProfile.objects.create_user(
            username="d9-user", password="x",
        )
        self.user.must_accept_consent = False
        self.user.save(update_fields=["must_accept_consent"])

    def test_privacy_policy_withdrawal_approved_sets_must_accept_consent(self):
        req = ConsentWithdrawalRequest.objects.create(
            user=self.user,
            kind=ConsentWithdrawalRequest.Kind.PRIVACY_POLICY,
            status=ConsentWithdrawalRequest.Status.PENDING,
        )
        # Sanity-check : must_accept_consent est bien False au départ.
        self.user.refresh_from_db()
        self.assertFalse(self.user.must_accept_consent)

        # Transition PENDING → APPROVED.
        req.status = ConsentWithdrawalRequest.Status.APPROVED
        req.save()

        self.user.refresh_from_db()
        self.assertTrue(
            self.user.must_accept_consent,
            "Retrait PRIVACY_POLICY approuvé doit forcer must_accept_consent=True",
        )

    def test_gps_withdrawal_does_not_affect_must_accept_consent(self):
        """Sanity-check : retrait GPS n'impacte PAS must_accept_consent."""
        req = ConsentWithdrawalRequest.objects.create(
            user=self.user,
            kind=ConsentWithdrawalRequest.Kind.GPS,
            status=ConsentWithdrawalRequest.Status.PENDING,
        )
        req.status = ConsentWithdrawalRequest.Status.APPROVED
        req.save()
        self.user.refresh_from_db()
        self.assertFalse(
            self.user.must_accept_consent,
            "Retrait GPS ne doit PAS forcer la ré-acceptation des consentements",
        )
