"""Throttling sur l'endpoint de login (anti credential-stuffing).

Vérifie que les deux throttles (IP + username) fonctionnent indépendamment
et que la 6ᵉ tentative dans la fenêtre est rejetée en 429.
"""
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import UserProfile


# Cache local en mémoire pour ne pas dépendre de Redis dans la suite de tests.
@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "throttle-tests",
        },
    },
)
class LoginThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = UserProfile.objects.create_user(
            username="alice", password="correct-horse-battery-staple",
        )

    def _attempt(self, username="alice", password="wrong", ip=None):
        kwargs = {"REMOTE_ADDR": ip} if ip else {}
        return self.client.post(
            reverse("auth-login"),
            {"username": username, "password": password},
            format="json",
            **kwargs,
        )

    def test_first_five_attempts_pass_then_429(self):
        # Mêmes IP + même username → throttle le plus restrictif s'applique.
        for i in range(5):
            resp = self._attempt(ip="10.0.0.1")
            self.assertIn(
                resp.status_code,
                (status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST),
                f"hit {i+1} should not be throttled yet, got {resp.status_code}",
            )
        resp6 = self._attempt(ip="10.0.0.1")
        self.assertEqual(resp6.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # Header standard DRF.
        self.assertIn("Retry-After", resp6.headers)

    def test_username_throttle_blocks_across_ips(self):
        """L'attaque distribuée (botnet) sature le throttle par username."""
        for i in range(5):
            self._attempt(username="bob_target", ip=f"10.0.{i}.1")
        # 6ᵉ tentative depuis une 6ᵉ IP différente → bloquée par le throttle USER.
        resp = self._attempt(username="bob_target", ip="10.0.99.99")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_different_usernames_dont_share_quota(self):
        # Throttle USER est par-username : une attaque sur alice ne bloque
        # pas un login légitime sur bob.
        for _ in range(5):
            self._attempt(username="alice", ip="10.0.0.1")
        # IP throttle bloquera depuis 10.0.0.1, mais une IP différente passe.
        resp = self._attempt(username="bob", ip="10.0.0.2")
        self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_correct_password_eventually_blocked_too(self):
        """Important : même un mot de passe juste est bloqué après 5 erreurs.
        Sinon un attaquant qui essaie 4 fois puis devine au 5ᵉ coup ne déclenche
        rien. La règle est sur le NOMBRE de tentatives, pas leur succès."""
        for _ in range(5):
            self._attempt(ip="10.0.0.1")  # 5 mauvais
        resp = self.client.post(
            reverse("auth-login"),
            {"username": "alice", "password": "correct-horse-battery-staple"},
            format="json",
            REMOTE_ADDR="10.0.0.1",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
