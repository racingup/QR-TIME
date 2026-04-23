"""Tests de la règle stricte : un manager ne touche JAMAIS ses propres données.

Seul le superuser peut s'auto-gérer (édition pointages, validation/refus,
édition de ses propres demandes en mode privilégié).
"""
from datetime import datetime, timedelta, timezone as dt_tz

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.absences.models import AbsenceRequest
from apps.clocking.models import ClockSession
from apps.missions.models import Mission
from apps.users.models import UserProfile


class AntiSelfActionTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.manager = UserProfile.objects.create_user(
            username="mgr", password="x", is_manager=True,
        )
        cls.mission_mgr = UserProfile.objects.create_user(
            username="mm", password="x", is_mission_manager=True,
        )
        cls.chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )

    def setUp(self):
        self.today = timezone.localdate()
        self.now = datetime(2026, 4, 21, 9, 0, tzinfo=dt_tz.utc)

    # ── ClockSession edit / regularize / manual ────────────────────────

    def _own_session(self, user, with_close=False):
        end = self.now + timedelta(hours=8) if with_close else None
        return ClockSession.objects.create(
            user=user, clock_in=self.now, clock_in_rounded=self.now,
            clock_out=end, clock_out_rounded=end,
        )

    def test_manager_cannot_edit_own_session(self):
        s = self._own_session(self.manager, with_close=True)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("clock-edit", args=[s.id]),
                                 {"justification": "auto-edit"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "FORBIDDEN_SELF_OR_OUT_OF_SCOPE")

    def test_superuser_can_edit_own_session(self):
        s = self._own_session(self.chief, with_close=True)
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(reverse("clock-edit", args=[s.id]),
                                 {"justification": "OK admin"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_manager_cannot_regularize_own_session(self):
        s = self._own_session(self.manager, with_close=False)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("clock-regularize", args=[s.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_create_manual_session_for_self(self):
        self.client.force_authenticate(self.manager)
        resp = self.client.post(reverse("clock-manual"), {
            "user_id": self.manager.id,
            "clock_in": self.now.isoformat(),
            "clock_out": (self.now + timedelta(hours=8)).isoformat(),
            "session_type": "OFFICE",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_create_manual_session_for_self(self):
        self.client.force_authenticate(self.chief)
        resp = self.client.post(reverse("clock-manual"), {
            "user_id": self.chief.id,
            "clock_in": self.now.isoformat(),
            "clock_out": (self.now + timedelta(hours=8)).isoformat(),
            "session_type": "OFFICE",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    # ── Mission approve / reject / update / assign ──────────────────────

    def _own_mission(self, user, status_=Mission.Status.PENDING):
        return Mission.objects.create(
            user=user, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
            status=status_,
        )

    def test_manager_cannot_self_approve_mission(self):
        m = self._own_mission(self.manager)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_mission_manager_cannot_self_approve(self):
        m = self._own_mission(self.mission_mgr)
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_self_reject_mission(self):
        m = self._own_mission(self.manager)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("mission-reject", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "SELF_DECISION_FORBIDDEN")

    def test_superuser_can_self_approve_mission(self):
        m = self._own_mission(self.chief)
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_manager_cannot_assign_mission_to_self_with_auto_approve(self):
        # Régression : path POST /api/missions/ avec user_id=self + auto_approve
        # ne doit PAS résulter en APPROVED si l'acteur n'est pas superuser.
        self.client.force_authenticate(self.manager)
        resp = self.client.post(reverse("mission-create"), {
            "user_id": self.manager.id,
            "auto_approve": True,
            "mission_type": "REMOTE",
            "date_start": self.today.isoformat(),
            "date_end": self.today.isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "PENDING")  # auto-approve ignoré

    def test_manager_can_edit_own_pending_mission_as_owner_only(self):
        # Cas légitime : un manager soumet sa propre demande → édite ses champs
        # employé tant que PENDING. Les champs privilégiés (mission_number) doivent
        # rester inaccessibles via cette route (lui-même n'agit pas en mode admin).
        m = self._own_mission(self.manager)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("mission-update", args=[m.id]), {
            "user_comment": "ok",
            "mission_number": "MIS-HACK",  # doit être ignoré
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        m.refresh_from_db()
        self.assertEqual(m.user_comment, "ok")
        self.assertEqual(m.mission_number, "")  # filtré

    def test_manager_cannot_edit_own_approved_mission_in_admin_mode(self):
        # Une fois approuvée, la mission devient verrouillée pour l'employé.
        m = self._own_mission(self.manager, status_=Mission.Status.APPROVED)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("mission-update", args=[m.id]), {
            "location_name": "post-fact",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_superuser_can_edit_own_approved_mission(self):
        m = self._own_mission(self.chief, status_=Mission.Status.APPROVED)
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(reverse("mission-update", args=[m.id]), {
            "mission_number": "MIS-CHIEF-1",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ── Absence approve / reject / update ──────────────────────────────

    def _own_absence(self, user):
        return AbsenceRequest.objects.create(
            user=user, absence_type=AbsenceRequest.AbsenceType.VACATION,
            date_start=self.today, date_end=self.today,
        )

    def test_manager_cannot_self_reject_absence(self):
        a = self._own_absence(self.manager)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("absence-reject", args=[a.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "SELF_DECISION_FORBIDDEN")

    def test_manager_cannot_update_own_absence_in_admin_mode(self):
        a = self._own_absence(self.manager)
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(reverse("absence-update", args=[a.id]), {
            "date_end": (self.today + timedelta(days=10)).isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_update_own_absence(self):
        a = self._own_absence(self.chief)
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(reverse("absence-update", args=[a.id]), {
            "manager_comment": "noted",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
