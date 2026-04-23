"""Tests for the manager_user_scope helper (point 9 — cantonnement par site)."""
from django.test import TestCase

from apps.users.models import Site, UserProfile
from services.audit import manager_user_scope


class ManagerScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.site_a = Site.objects.create(name="A", latitude=0, longitude=0, qr_code_token="ta")
        cls.site_b = Site.objects.create(name="B", latitude=0, longitude=0, qr_code_token="tb")
        # Employees on each site + a transverse one (no home_site).
        cls.alice = UserProfile.objects.create_user(username="alice", password="x", home_site=cls.site_a)
        cls.bob = UserProfile.objects.create_user(username="bob", password="x", home_site=cls.site_b)
        cls.carl = UserProfile.objects.create_user(username="carl", password="x")  # no site
        # Manager A — only sees site A.
        cls.mgr_a = UserProfile.objects.create_user(
            username="mgr_a", password="x", is_manager=True, home_site=cls.site_a,
        )
        # Manager B.
        cls.mgr_b = UserProfile.objects.create_user(
            username="mgr_b", password="x", is_manager=True, home_site=cls.site_b,
        )
        # Org-wide manager — no home_site.
        cls.mgr_global = UserProfile.objects.create_user(
            username="mgr_global", password="x", is_manager=True,
        )
        cls.chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )

    def test_superuser_sees_everyone(self):
        ids = set(manager_user_scope(self.chief).values_list("id", flat=True))
        self.assertIn(self.alice.id, ids)
        self.assertIn(self.bob.id, ids)
        self.assertIn(self.carl.id, ids)

    def test_manager_with_site_only_sees_same_site(self):
        ids = set(manager_user_scope(self.mgr_a).values_list("id", flat=True))
        self.assertIn(self.alice.id, ids)
        self.assertIn(self.mgr_a.id, ids)        # himself
        self.assertNotIn(self.bob.id, ids)
        self.assertNotIn(self.carl.id, ids)
        self.assertNotIn(self.mgr_b.id, ids)

    def test_manager_without_site_sees_everyone_except_superusers(self):
        ids = set(manager_user_scope(self.mgr_global).values_list("id", flat=True))
        self.assertIn(self.alice.id, ids)
        self.assertIn(self.bob.id, ids)
        self.assertIn(self.carl.id, ids)
        # Hiérarchie : un manager (non-superuser) ne voit JAMAIS un admin.
        self.assertNotIn(self.chief.id, ids)

    def test_manager_with_site_excludes_superuser_from_same_site(self):
        # Un superuser rattaché au site A ne doit pas apparaître pour mgr_a.
        chief_at_site_a = UserProfile.objects.create_superuser(
            username="chief_a", email="ca@x", password="x",
        )
        chief_at_site_a.home_site = self.site_a
        chief_at_site_a.save(update_fields=["home_site"])
        ids = set(manager_user_scope(self.mgr_a).values_list("id", flat=True))
        self.assertNotIn(chief_at_site_a.id, ids)
        self.assertIn(self.alice.id, ids)  # toujours visible

    def test_superuser_sees_themselves(self):
        # L'admin doit pouvoir s'auto-gérer.
        ids = set(manager_user_scope(self.chief).values_list("id", flat=True))
        self.assertIn(self.chief.id, ids)

    def test_employee_only_sees_self(self):
        ids = set(manager_user_scope(self.alice).values_list("id", flat=True))
        self.assertEqual(ids, {self.alice.id})

    def test_inactive_users_excluded(self):
        self.alice.is_active = False
        self.alice.save()
        ids = set(manager_user_scope(self.chief).values_list("id", flat=True))
        self.assertNotIn(self.alice.id, ids)
