"""DRF integration tests for the absences endpoints."""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.absences.models import AbsenceRequest
from apps.users.models import UserProfile


class AbsencesAPITests(APITestCase):
    def setUp(self):
        self.employee = UserProfile.objects.create_user(username="alice", password="x")
        self.manager = UserProfile.objects.create_user(
            username="boss", password="x", is_manager=True,
        )
        self.today = timezone.localdate()

    def test_employee_creates_pending_absence(self):
        self.client.force_authenticate(self.employee)
        resp = self.client.post(reverse("absence-create"), {
            "absence_type": "VACATION",
            "date_start": self.today.isoformat(),
            "date_end": (self.today + timedelta(days=4)).isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["status"], "PENDING")
        a = AbsenceRequest.objects.get()
        self.assertEqual(a.user, self.employee)

    def test_manager_approves_absence(self):
        a = AbsenceRequest.objects.create(
            user=self.employee, absence_type="VACATION",
            date_start=self.today, date_end=self.today + timedelta(days=2),
        )
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(
            reverse("absence-approve", args=[a.id]),
            {"manager_comment": "OK pour ces dates"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")
        self.assertEqual(resp.data["manager_comment"], "OK pour ces dates")

    def test_non_manager_cannot_approve_absence(self):
        a = AbsenceRequest.objects.create(
            user=self.employee, absence_type="SICK",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.employee)
        resp = self.client.patch(reverse("absence-approve", args=[a.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_approve_their_own_absence(self):
        a = AbsenceRequest.objects.create(
            user=self.manager, absence_type="VACATION",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("absence-approve", args=[a.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "SELF_APPROVAL_FORBIDDEN")
        a.refresh_from_db()
        self.assertEqual(a.status, "PENDING")

    def test_superuser_can_approve_their_own_absence(self):
        chief = UserProfile.objects.create_superuser(
            username="chief", password="x", email="chief@example.com",
        )
        a = AbsenceRequest.objects.create(
            user=chief, absence_type="VACATION",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(chief)
        resp = self.client.patch(reverse("absence-approve", args=[a.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")

    def test_unauthenticated_cannot_create_absence(self):
        resp = self.client.post(reverse("absence-create"), {
            "absence_type": "VACATION",
            "date_start": self.today.isoformat(),
            "date_end": self.today.isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
