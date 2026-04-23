"""Tests for the new mission manager role + mission_number + auto-approve."""
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clocking.models import ClockSession
from apps.missions.models import Mission
from apps.users.models import Site, UserProfile


class MissionManagerTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.site_a = Site.objects.create(name="A", latitude=0, longitude=0, qr_code_token="ta")
        cls.site_b = Site.objects.create(name="B", latitude=0, longitude=0, qr_code_token="tb")
        cls.alice = UserProfile.objects.create_user(
            username="alice", password="x", home_site=cls.site_a,
        )
        cls.bob = UserProfile.objects.create_user(
            username="bob", password="x", home_site=cls.site_b,
        )
        cls.mgr_a = UserProfile.objects.create_user(
            username="mgr_a", password="x", is_manager=True, home_site=cls.site_a,
        )
        cls.mission_mgr = UserProfile.objects.create_user(
            username="mm", password="x", is_mission_manager=True,
        )
        cls.chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )

    def setUp(self):
        self.today = timezone.localdate()

    # ── Création / assignation ─────────────────────────────────────────

    def test_mission_manager_assigns_mission_to_employee_auto_approved(self):
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.post(reverse("mission-create"), {
            "user_id": self.bob.id,
            "auto_approve": True,
            "mission_type": "FIELD",
            "date_start": self.today.isoformat(),
            "date_end": self.today.isoformat(),
            "location_name": "Client X",
            "gps_radius_meters": 500,
            "mission_number": "MIS-2026-001",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["status"], "APPROVED")
        self.assertTrue(resp.data["qr_token"])
        self.assertEqual(resp.data["mission_number"], "MIS-2026-001")
        self.assertEqual(resp.data["user"], self.bob.id)
        self.assertEqual(resp.data["approved_by"], self.mission_mgr.id)

    def test_employee_cannot_assign_mission_to_other(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(reverse("mission-create"), {
            "user_id": self.bob.id,
            "auto_approve": True,
            "mission_type": "REMOTE",
            "date_start": self.today.isoformat(),
            "date_end": self.today.isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_mission_manager_cannot_assign_to_superuser(self):
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.post(reverse("mission-create"), {
            "user_id": self.chief.id,
            "auto_approve": True,
            "mission_type": "REMOTE",
            "date_start": self.today.isoformat(),
            "date_end": self.today.isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ── Listing transverse ──────────────────────────────────────────────

    def test_all_missions_visible_to_mission_manager_across_sites(self):
        # FIELD missions — cross-site visibility for a pure mission_manager.
        # (REMOTE exclu par règle : voir test_mission_manager_pur_listing_excludes_remote.)
        Mission.objects.create(user=self.alice, mission_type="FIELD",
                               date_start=self.today, date_end=self.today)
        Mission.objects.create(user=self.bob, mission_type="FIELD",
                               date_start=self.today, date_end=self.today)
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.get(reverse("mission-all"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        users = {m["user"] for m in resp.data}
        self.assertIn(self.alice.id, users)
        self.assertIn(self.bob.id, users)

    def test_all_missions_excludes_superusers_for_non_super_actor(self):
        Mission.objects.create(user=self.chief, mission_type="FIELD",
                               date_start=self.today, date_end=self.today)
        Mission.objects.create(user=self.alice, mission_type="FIELD",
                               date_start=self.today, date_end=self.today)
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.get(reverse("mission-all"))
        users = {m["user"] for m in resp.data}
        self.assertNotIn(self.chief.id, users)
        self.assertIn(self.alice.id, users)

    def test_regular_manager_listing_scoped_by_site(self):
        Mission.objects.create(user=self.alice, mission_type="REMOTE",
                               date_start=self.today, date_end=self.today)
        Mission.objects.create(user=self.bob, mission_type="REMOTE",
                               date_start=self.today, date_end=self.today)
        self.client.force_authenticate(self.mgr_a)
        resp = self.client.get(reverse("mission-all"))
        users = {m["user"] for m in resp.data}
        self.assertIn(self.alice.id, users)
        self.assertNotIn(self.bob.id, users)

    def test_employee_blocked_from_all_missions(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.get(reverse("mission-all"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ── Approval (transverse) ──────────────────────────────────────────

    def test_mission_manager_approves_cross_site_mission(self):
        # FIELD : le mission_manager pur peut approuver cross-site.
        m = Mission.objects.create(
            user=self.bob, mission_type="FIELD",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")

    def test_regular_manager_still_approves_missions(self):
        # Régression — un manager régulier conserve son pouvoir d'approbation.
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.mgr_a)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "APPROVED")

    # ── Édition (Option 3B : APPROVED éditable par mission mgr) ────────

    def test_mission_manager_edits_approved_mission(self):
        # FIELD : édition APPROVED autorisée au mission_manager pur (Option 3B).
        m = Mission.objects.create(
            user=self.alice, mission_type="FIELD",
            date_start=self.today, date_end=self.today,
        )
        m.approve(self.mission_mgr)
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.patch(reverse("mission-update", args=[m.id]), {
            "mission_number": "MIS-EDIT-42",
            "location_name": "Nouveau lieu",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        m.refresh_from_db()
        self.assertEqual(m.mission_number, "MIS-EDIT-42")
        self.assertEqual(m.location_name, "Nouveau lieu")

    def test_employee_cannot_edit_approved_mission(self):
        # Régression : la règle PENDING-only s'applique toujours pour l'employé.
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        m.approve(self.mgr_a)
        self.client.force_authenticate(self.alice)
        resp = self.client.patch(reverse("mission-update", args=[m.id]), {
            "user_comment": "trop tard",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_employee_cannot_set_mission_number(self):
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.alice)
        resp = self.client.patch(reverse("mission-update", args=[m.id]), {
            "mission_number": "MIS-HACK",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        m.refresh_from_db()
        self.assertEqual(m.mission_number, "")  # ignoré

    # ── time_spent_minutes ─────────────────────────────────────────────

    # ── REMOTE = manager / admin uniquement (jamais mission_manager pur) ──

    def test_mission_manager_pur_cannot_approve_remote(self):
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "OUT_OF_SCOPE_HIERARCHY")

    def test_mission_manager_pur_cannot_reject_remote(self):
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.patch(reverse("mission-reject", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_mission_manager_pur_cannot_edit_remote(self):
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.patch(reverse("mission-update", args=[m.id]), {
            "location_name": "hack",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_mission_manager_pur_cannot_assign_remote(self):
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.post(reverse("mission-create"), {
            "user_id": self.alice.id,
            "auto_approve": True,
            "mission_type": "REMOTE",
            "date_start": self.today.isoformat(),
            "date_end": self.today.isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_mission_manager_pur_listing_excludes_remote(self):
        Mission.objects.create(user=self.alice, mission_type="REMOTE",
                               date_start=self.today, date_end=self.today)
        Mission.objects.create(user=self.alice, mission_type="FIELD",
                               date_start=self.today, date_end=self.today)
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.get(reverse("mission-all"))
        types = {m["mission_type"] for m in resp.data}
        self.assertEqual(types, {"FIELD"})

    def test_regular_manager_handles_remote(self):
        # Régression : un manager régulier (sans is_mission_manager) approuve REMOTE.
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.mgr_a)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_dual_role_mgr_and_mission_mgr_handles_remote(self):
        # Si l'utilisateur est is_manager ET is_mission_manager, il peut faire
        # du REMOTE (via son rôle de manager régulier).
        dual = UserProfile.objects.create_user(
            username="dual", password="x",
            is_manager=True, is_mission_manager=True, home_site=self.site_a,
        )
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(dual)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superuser_handles_remote(self):
        m = Mission.objects.create(
            user=self.alice, mission_type="REMOTE",
            date_start=self.today, date_end=self.today,
        )
        self.client.force_authenticate(self.chief)
        resp = self.client.patch(reverse("mission-approve", args=[m.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_time_spent_minutes_aggregates_sessions(self):
        m = Mission.objects.create(
            user=self.alice, mission_type="FIELD",
            date_start=self.today, date_end=self.today,
        )
        m.approve(self.mission_mgr)
        from datetime import datetime, timezone as dt_tz
        # Une session de 90 minutes liée à la mission.
        start = datetime(2026, 4, 21, 9, 0, tzinfo=dt_tz.utc)
        end = datetime(2026, 4, 21, 10, 30, tzinfo=dt_tz.utc)
        ClockSession.objects.create(
            user=self.alice, mission=m, session_type="MISSION",
            clock_in=start, clock_in_rounded=start,
            clock_out=end, clock_out_rounded=end,
        )
        # Une autre de 30 minutes.
        start2 = datetime(2026, 4, 21, 14, 0, tzinfo=dt_tz.utc)
        end2 = datetime(2026, 4, 21, 14, 30, tzinfo=dt_tz.utc)
        ClockSession.objects.create(
            user=self.alice, mission=m, session_type="MISSION",
            clock_in=start2, clock_in_rounded=start2,
            clock_out=end2, clock_out_rounded=end2,
        )
        self.client.force_authenticate(self.mission_mgr)
        resp = self.client.get(reverse("mission-all"))
        rows = [x for x in resp.data if x["id"] == m.id]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["time_spent_minutes"], 120)
