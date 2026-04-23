"""La tâche `detect_forgotten_clockouts` envoie un mail à l'utilisateur
*lors de la création initiale* de l'Alert — pas à chaque rerun.
"""
from datetime import datetime, timedelta, timezone as dt_tz

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.clocking.models import Alert, ClockSession
from apps.clocking.tasks import detect_forgotten_clockouts
from apps.users.models import Site, UserProfile


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="qrtime.ch <test@qrtime.test>",
    SITE_PUBLIC_URL="https://app.test",
)
class ForgottenEmailTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(name="HQ", latitude=0, longitude=0, qr_code_token="t")

    def setUp(self):
        mail.outbox = []
        # Session ouverte démarrée *aujourd'hui* matin (pas clôturée).
        today = timezone.localdate()
        ci = timezone.make_aware(
            datetime.combine(today, datetime.min.time()).replace(hour=9),
        )
        self.user = UserProfile.objects.create_user(
            username="alice", password="x", email="alice@example.com",
        )
        self.session = ClockSession.objects.create(
            user=self.user, site=self.site,
            clock_in=ci, clock_in_rounded=ci,
        )

    def test_first_run_sends_one_email(self):
        result = detect_forgotten_clockouts()
        self.assertEqual(result["alerts_created"], 1)
        self.assertEqual(result["emails_sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ["alice@example.com"])
        self.assertIn("oublié", msg.subject.lower())
        self.assertIn("alice", msg.body)
        self.assertIn("https://app.test", msg.body)

    def test_second_run_does_not_resend(self):
        detect_forgotten_clockouts()
        mail.outbox = []
        result = detect_forgotten_clockouts()
        # Alert déjà existante → pas de nouvelle, donc pas de re-mail.
        self.assertEqual(result["alerts_created"], 0)
        self.assertEqual(result["emails_sent"], 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_user_without_email_does_not_break_task(self):
        # Un user sans email ne reçoit rien mais ne casse pas la tâche.
        bob = UserProfile.objects.create_user(username="bob", password="x", email="")
        today = timezone.localdate()
        ci = timezone.make_aware(
            datetime.combine(today, datetime.min.time()).replace(hour=10),
        )
        ClockSession.objects.create(
            user=bob, site=self.site, clock_in=ci, clock_in_rounded=ci,
        )
        result = detect_forgotten_clockouts()
        # Alice + Bob → 2 alertes, mais 1 seul mail (alice).
        self.assertEqual(result["alerts_created"], 2)
        self.assertEqual(result["emails_sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["alice@example.com"])

    def test_anonymized_user_skipped(self):
        # Compte désactivé (anonymisé) → pas de mail même si email présent.
        self.user.is_active = False
        self.user.username = "deleted_42"
        self.user.save(update_fields=["is_active", "username"])
        result = detect_forgotten_clockouts()
        self.assertEqual(result["emails_sent"], 0)
        self.assertEqual(len(mail.outbox), 0)
