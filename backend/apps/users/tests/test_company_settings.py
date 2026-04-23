"""Configurateur entreprise — singleton CompanySettings.

Vérifie :
  - Singleton effectif (pk=1 toujours, pas de doublons)
  - PUT admin : superuser uniquement, validation hex / data URL / taille
  - GET /api/me/company/ : tout user authentifié, payload complet
  - GET /api/branding/ : anonyme, payload restreint (pas d'email DPO etc.)
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import CompanySettings, UserProfile


class CompanySettingsModelTests(APITestCase):
    def test_singleton_load_returns_same_instance(self):
        # API publique du modèle = `load()` (get_or_create). Personne n'est
        # censé appeler `objects.create()` directement.
        a = CompanySettings.load()
        b = CompanySettings.load()
        self.assertEqual(a.pk, 1)
        self.assertEqual(b.pk, 1)
        self.assertEqual(CompanySettings.objects.count(), 1)

    def test_save_forces_pk_to_1(self):
        cfg = CompanySettings.load()
        cfg.name = "Test"
        cfg.save()
        cfg.refresh_from_db()
        self.assertEqual(cfg.pk, 1)
        self.assertEqual(cfg.name, "Test")

    def test_load_creates_on_first_call(self):
        CompanySettings.objects.all().delete()
        cfg = CompanySettings.load()
        self.assertEqual(cfg.pk, 1)
        # Defaults
        self.assertEqual(cfg.primary_color, "#1e3a5f")
        self.assertEqual(cfg.country, "Suisse")


class CompanySettingsAdminEndpointTests(APITestCase):
    def setUp(self):
        self.chief = UserProfile.objects.create_superuser(
            username="chief", email="c@x", password="x",
        )
        self.alice = UserProfile.objects.create_user(username="alice", password="x")

    def test_get_returns_singleton_payload(self):
        self.client.force_authenticate(self.chief)
        resp = self.client.get(reverse("admin-company-settings"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("primary_color", resp.data)
        self.assertEqual(resp.data["primary_color"], "#1e3a5f")  # défaut

    def test_put_updates_fields(self):
        self.client.force_authenticate(self.chief)
        resp = self.client.put(
            reverse("admin-company-settings"),
            {
                "name": "Acme SA",
                "legal_form": "SA",
                "city": "Lausanne",
                "country": "Suisse",
                "dpo_contact_email": "dpo@acme.ch",
                "primary_color": "#FF0080",
                "secondary_color": "#00cc66",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        cfg = CompanySettings.load()
        self.assertEqual(cfg.name, "Acme SA")
        self.assertEqual(cfg.primary_color, "#ff0080")  # normalisé lower
        self.assertEqual(cfg.dpo_contact_email, "dpo@acme.ch")

    def test_put_rejects_invalid_hex(self):
        self.client.force_authenticate(self.chief)
        resp = self.client.put(
            reverse("admin-company-settings"),
            {"primary_color": "rouge"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("primary_color", resp.data)

    def test_put_rejects_oversized_logo(self):
        big_logo = "data:image/png;base64," + ("A" * 200_000)  # 200 KB+
        self.client.force_authenticate(self.chief)
        resp = self.client.put(
            reverse("admin-company-settings"),
            {"logo_data_url": big_logo}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("logo_data_url", resp.data)

    def test_put_rejects_non_data_url_logo(self):
        self.client.force_authenticate(self.chief)
        resp = self.client.put(
            reverse("admin-company-settings"),
            {"logo_data_url": "https://example.com/logo.png"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_superuser_cannot_put(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.put(
            reverse("admin-company-settings"),
            {"name": "Hack SA"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_partial_put_keeps_unspecified_fields(self):
        cfg = CompanySettings.load()
        cfg.name = "Original"
        cfg.dpo_contact_email = "dpo@original.ch"
        cfg.save()
        self.client.force_authenticate(self.chief)
        # Met à jour SEULEMENT la couleur — name doit rester "Original"
        self.client.put(
            reverse("admin-company-settings"),
            {"primary_color": "#abc"}, format="json",
        )
        cfg.refresh_from_db()
        self.assertEqual(cfg.name, "Original")
        self.assertEqual(cfg.dpo_contact_email, "dpo@original.ch")
        self.assertEqual(cfg.primary_color, "#abc")


class MeCompanyEndpointTests(APITestCase):
    def setUp(self):
        self.alice = UserProfile.objects.create_user(username="alice", password="x")
        cfg = CompanySettings.load()
        cfg.name = "Acme SA"
        cfg.dpo_contact_email = "dpo@acme.ch"
        cfg.save()

    def test_authenticated_user_gets_full_payload(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.get(reverse("me-company"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Acme SA")
        self.assertEqual(resp.data["dpo_contact_email"], "dpo@acme.ch")

    def test_anonymous_blocked(self):
        resp = self.client.get(reverse("me-company"))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class PublicBrandingEndpointTests(APITestCase):
    def setUp(self):
        cfg = CompanySettings.load()
        cfg.name = "Acme SA"
        cfg.dpo_contact_email = "dpo@acme.ch"
        cfg.address_line = "rue X 1"
        cfg.primary_color = "#abcdef"
        cfg.save()

    def test_anonymous_can_get_branding(self):
        # Pas de force_authenticate — requête anonyme
        resp = self.client.get(reverse("public-branding"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Acme SA")
        self.assertEqual(resp.data["primary_color"], "#abcdef")

    def test_branding_payload_does_NOT_leak_sensitive_fields(self):
        resp = self.client.get(reverse("public-branding"))
        self.assertNotIn("dpo_contact_email", resp.data)
        self.assertNotIn("address_line", resp.data)
        self.assertNotIn("dpo_contact_phone", resp.data)
