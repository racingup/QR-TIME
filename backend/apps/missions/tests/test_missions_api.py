"""DRF integration tests for the missions endpoints."""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.missions.models import Mission
from apps.users.models import UserProfile


class MissionsAPITests(APITestCase):
    def setUp(self):
        self.employee = UserProfile.objects.create_user(username="alice", password="x")
        self.manager = UserProfile.objects.create_user(
            username="boss", password="x", is_manager=True,
        )
        self.today = timezone.localdate()

    # ── Create ─────────────────────────────────────────────────────────
    def test_employee_creates_pending_mission(self):
        self.client.force_authenticate(self.employee)
        resp = self.client.post(reverse("mission-create"), {
            "mission_type": "REMOTE",
            "date_start": self.today.isoformat(),
            "date_end": self.today.isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["status"], "PENDING")
        self.assertIsNone(resp.data["qr_token"])
        m = Mission.objects.get()
        self.assertEqual(m.user, self.employee)

    # ── Approve ────────────────────────────────────────────────────────
    def test_manager_approves_and_qr_token_is_generated(self):
        m = Mission.objects.create(
            user=self.employee, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(
            reverse("mission-approve", args=[m.id]),
            {"manager_comment": "OK"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")
        self.assertTrue(resp.data["qr_token"])
        self.assertGreaterEqual(len(resp.data["qr_token"]), 40)  # token_urlsafe(32)
        self.assertEqual(resp.data["manager_comment"], "OK")

    def test_non_manager_cannot_approve(self):
        m = Mission.objects.create(
            user=self.employee, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.employee)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ── Reject ─────────────────────────────────────────────────────────
    def test_manager_rejects_with_comment(self):
        m = Mission.objects.create(
            user=self.employee, mission_type="FIELD",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(
            reverse("mission-reject", args=[m.id]),
            {"manager_comment": "Pas pertinent"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "REJECTED")
        self.assertEqual(resp.data["manager_comment"], "Pas pertinent")
        self.assertIsNone(resp.data["qr_token"])

    # ── QR ─────────────────────────────────────────────────────────────
    def test_owner_can_fetch_qr_after_approval(self):
        m = Mission.objects.create(
            user=self.employee, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        m.approve(self.manager)
        self.client.force_authenticate(self.employee)
        resp = self.client.get(reverse("mission-qr", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["qr_token"], m.qr_token)
        # Base64 PNG header is iVBORw0K… (raw bytes start \x89PNG).
        png_b64 = resp.data["qr_png_base64"]
        self.assertTrue(png_b64.startswith("iVBORw0K"))
        self.assertGreater(len(png_b64), 100)

    def test_qr_before_approval_returns_409(self):
        m = Mission.objects.create(
            user=self.employee, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.employee)
        resp = self.client.get(reverse("mission-qr", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_other_employee_cannot_fetch_qr(self):
        m = Mission.objects.create(
            user=self.employee, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        m.approve(self.manager)
        other = UserProfile.objects.create_user(username="eve", password="x")
        self.client.force_authenticate(other)
        resp = self.client.get(reverse("mission-qr", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_qr_404_for_unknown_mission(self):
        self.client.force_authenticate(self.employee)
        resp = self.client.get(reverse("mission-qr", args=[99999]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ── Anti-self-approval ─────────────────────────────────────────────
    def test_manager_cannot_approve_their_own_mission(self):
        # boss is is_manager but not is_superuser → cannot self-approve.
        m = Mission.objects.create(
            user=self.manager, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "SELF_APPROVAL_FORBIDDEN")
        m.refresh_from_db()
        self.assertEqual(m.status, "PENDING")
        self.assertIsNone(m.qr_token)

    def test_superuser_can_approve_their_own_mission(self):
        chief = UserProfile.objects.create_superuser(
            username="chief", password="x", email="chief@example.com",
        )
        m = Mission.objects.create(
            user=chief, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(chief)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")
        self.assertTrue(resp.data["qr_token"])

    def test_superuser_can_approve_a_managers_mission(self):
        chief = UserProfile.objects.create_superuser(
            username="chief", password="x", email="chief@example.com",
        )
        m = Mission.objects.create(
            user=self.manager, mission_type="FIELD",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(chief)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")
