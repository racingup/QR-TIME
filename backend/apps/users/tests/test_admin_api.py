"""Integration tests for /api/admin/* endpoints."""
from datetime import time
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clocking.models import FixedTimeSlot
from apps.users.models import Site, SiteQRAudit, ToleranceConfig, UserProfile


class AdminPermissionsTests(APITestCase):
    def setUp(self):
        self.employee = UserProfile.objects.create_user(username="alice", password="x")
        self.manager = UserProfile.objects.create_user(
            username="boss", password="x", is_manager=True,
        )

    def test_employee_blocked_from_admin_routes(self):
        self.client.force_authenticate(self.employee)
        for url in (
            reverse("admin-site-list"),
            reverse("admin-fixed-slot-list"),
            reverse("admin-user-list"),
            reverse("admin-tolerance"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_manager_blocked_from_admin_settings_routes(self):
        # Sites / fixed slots / tolerance / holidays / users : superuser only.
        self.client.force_authenticate(self.manager)
        for url in (
            reverse("admin-site-list"),
            reverse("admin-fixed-slot-list"),
            reverse("admin-user-list"),
            reverse("admin-tolerance"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_unauth_blocked_from_admin_routes(self):
        for url in (
            reverse("admin-site-list"),
            reverse("admin-tolerance"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_401_UNAUTHORIZED,
                )


class SitesAdminTests(APITestCase):
    def setUp(self):
        # Site/slot/tolerance settings : superuser only.
        self.manager = UserProfile.objects.create_superuser(
            username="boss", email="boss@example.com", password="x",
        )
        self.manager.is_manager = True
        self.manager.save(update_fields=["is_manager"])
        self.client.force_authenticate(self.manager)

    def test_create_site(self):
        resp = self.client.post(reverse("admin-site-list"), {
            "name": "Siège Paris",
            "latitude": "48.8530",
            "longitude": "2.3499",
            "gps_radius_meters": 200,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        site = Site.objects.get()
        self.assertEqual(site.gps_radius_meters, 200)
        self.assertTrue(site.qr_code_token)  # auto-generated

    def test_list_update_delete_site(self):
        site = Site.objects.create(
            name="Lyon", latitude=Decimal("45.76"), longitude=Decimal("4.83"),
        )
        self.assertEqual(
            self.client.get(reverse("admin-site-list")).data["count"], 1,
        )
        resp = self.client.patch(
            reverse("admin-site-detail", args=[site.id]),
            {"gps_radius_meters": 300}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        site.refresh_from_db()
        self.assertEqual(site.gps_radius_meters, 300)

        resp = self.client.delete(reverse("admin-site-detail", args=[site.id]))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Site.objects.exists())

    def test_regen_qr_rotates_token_and_logs_old(self):
        site = Site.objects.create(
            name="Paris", latitude=Decimal("48.85"), longitude=Decimal("2.35"),
        )
        old = site.qr_code_token
        resp = self.client.post(
            reverse("admin-site-regen-qr", args=[site.id]),
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["old_token"], old)
        self.assertNotEqual(resp.data["new_token"], old)
        site.refresh_from_db()
        self.assertEqual(site.qr_code_token, resp.data["new_token"])

        audit = SiteQRAudit.objects.get()
        self.assertEqual(audit.site, site)
        self.assertEqual(audit.old_token, old)
        self.assertEqual(audit.new_token, site.qr_code_token)
        self.assertEqual(audit.regenerated_by, self.manager)


class FixedSlotsAdminTests(APITestCase):
    def setUp(self):
        # Site/slot/tolerance settings : superuser only.
        self.manager = UserProfile.objects.create_superuser(
            username="boss", email="boss@example.com", password="x",
        )
        self.manager.is_manager = True
        self.manager.save(update_fields=["is_manager"])
        self.client.force_authenticate(self.manager)

    def test_create_and_list_fixed_slot(self):
        resp = self.client.post(reverse("admin-fixed-slot-list"), {
            "name": "Matin", "start_time": "09:30", "end_time": "11:30",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        slot = FixedTimeSlot.objects.get()
        self.assertEqual(slot.start_time, time(9, 30))


class ToleranceAdminTests(APITestCase):
    def setUp(self):
        # Site/slot/tolerance settings : superuser only.
        self.manager = UserProfile.objects.create_superuser(
            username="boss", email="boss@example.com", password="x",
        )
        self.manager.is_manager = True
        self.manager.save(update_fields=["is_manager"])
        self.client.force_authenticate(self.manager)

    def test_get_returns_singleton_with_defaults(self):
        resp = self.client.get(reverse("admin-tolerance"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("tolerance_minutes", resp.data)
        self.assertIn("rounding_direction", resp.data)

    def test_put_updates_singleton(self):
        resp = self.client.put(reverse("admin-tolerance"), {
            "tolerance_minutes": 10, "rounding_direction": "DOWN",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["tolerance_minutes"], 10)
        # Singleton: only one row, pk=1.
        self.assertEqual(ToleranceConfig.objects.count(), 1)
        self.assertEqual(ToleranceConfig.objects.get().rounding_direction, "DOWN")


class UsersAdminTests(APITestCase):
    def setUp(self):
        # User CRUD is restricted to superusers ("big manager").
        self.chief = UserProfile.objects.create_superuser(
            username="chief", email="chief@example.com", password="x",
        )
        self.client.force_authenticate(self.chief)

    def test_regular_manager_cannot_access_user_crud(self):
        manager = UserProfile.objects.create_user(
            username="boss", password="x", is_manager=True,
        )
        self.client.force_authenticate(manager)
        self.assertEqual(
            self.client.get(reverse("admin-user-list")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_create_user(self):
        resp = self.client.post(reverse("admin-user-list"), {
            "username": "newbie",
            "weekly_target_hours": "21.00",
            "vacation_quota": 20,
            "is_manager": False,
            "password": "supersecret",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        user = UserProfile.objects.get(username="newbie")
        self.assertEqual(user.weekly_target_hours, Decimal("21.00"))
        self.assertEqual(user.vacation_quota, 20)
        self.assertFalse(user.is_manager)
        self.assertTrue(user.check_password("supersecret"))

    def test_update_user_promotes_to_manager(self):
        u = UserProfile.objects.create_user(
            username="bob", password="x", weekly_target_hours=Decimal("42.00"),
        )
        resp = self.client.patch(
            reverse("admin-user-detail", args=[u.id]),
            {"is_manager": True, "vacation_quota": 30}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        u.refresh_from_db()
        self.assertTrue(u.is_manager)
        self.assertEqual(u.vacation_quota, 30)

    def test_overtime_balance_is_read_only(self):
        u = UserProfile.objects.create_user(username="bob", password="x")
        resp = self.client.patch(
            reverse("admin-user-detail", args=[u.id]),
            {"overtime_balance": "999.99"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        u.refresh_from_db()
        self.assertEqual(u.overtime_balance, Decimal("0.00"))
