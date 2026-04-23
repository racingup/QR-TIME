"""Purge LPD : la commande `purge_old_data` supprime ce qui dépasse la
fenêtre de rétention et trace l'opération dans AdminAuditLog.

Cf. core/settings.RETENTION_TIME_DATA_YEARS / RETENTION_AUDIT_LOG_YEARS.
"""
from datetime import datetime, timedelta, timezone as dt_tz

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.absences.models import AbsenceRequest
from apps.clocking.models import Alert, ClockSession
from apps.missions.models import Mission
from apps.users.management.commands.purge_old_data import run_purge
from apps.users.models import AdminAuditLog, Site, UserProfile


@override_settings(RETENTION_TIME_DATA_YEARS=5, RETENTION_AUDIT_LOG_YEARS=10)
class PurgeRetentionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.site = Site.objects.create(name="A", latitude=0, longitude=0, qr_code_token="t")
        cls.user = UserProfile.objects.create_user(username="alice", password="x")

    def _aged_session(self, years_ago: int):
        """Crée une session datée précisément à `years_ago` ans en arrière."""
        ts = timezone.now() - timedelta(days=365 * years_ago + 30)
        return ClockSession.objects.create(
            user=self.user, site=self.site,
            clock_in=ts, clock_in_rounded=ts,
            clock_out=ts + timedelta(hours=8),
            clock_out_rounded=ts + timedelta(hours=8),
        )

    def test_dry_run_changes_nothing(self):
        old = self._aged_session(years_ago=6)  # > 5 ans
        result = run_purge(dry_run=True)
        self.assertTrue(result["dry_run"])
        self.assertEqual(result["counts"]["ClockSession (clock_in<cutoff)"], 1)
        self.assertTrue(ClockSession.objects.filter(pk=old.pk).exists())
        # Aucune entrée audit créée en dry-run.
        self.assertFalse(
            AdminAuditLog.objects.filter(action=AdminAuditLog.Action.DATA_PURGED).exists(),
        )

    def test_purge_removes_only_old_data(self):
        old = self._aged_session(years_ago=6)
        recent = self._aged_session(years_ago=1)
        result = run_purge(dry_run=False)
        self.assertEqual(result["counts"]["ClockSession (clock_in<cutoff)"], 1)
        self.assertFalse(ClockSession.objects.filter(pk=old.pk).exists())
        self.assertTrue(ClockSession.objects.filter(pk=recent.pk).exists())

    def test_purge_writes_meta_audit_entry(self):
        self._aged_session(years_ago=6)
        run_purge(dry_run=False)
        entry = AdminAuditLog.objects.get(action=AdminAuditLog.Action.DATA_PURGED)
        self.assertIsNone(entry.actor)  # opération système, pas d'acteur
        self.assertEqual(entry.object_type, "retention_sweep")
        self.assertIn("counts", entry.details)
        self.assertEqual(entry.details["retention_time_data_years"], 5)
        self.assertEqual(entry.details["retention_audit_log_years"], 10)

    def test_audit_log_has_separate_retention(self):
        # AdminAuditLog purgé seulement après 10 ans, pas 5.
        old_audit = AdminAuditLog.objects.create(
            actor=None, action=AdminAuditLog.Action.USER_UPDATE,
            object_type="x",
        )
        # Forcer la date de création (auto_now_add ne se laisse pas surclasser
        # à la création — on update juste après).
        old_date = timezone.now() - timedelta(days=365 * 7)  # 7 ans, < 10
        AdminAuditLog.objects.filter(pk=old_audit.pk).update(created_at=old_date)
        run_purge(dry_run=False)
        # 7 ans < seuil audit (10 ans) → toujours là.
        self.assertTrue(AdminAuditLog.objects.filter(pk=old_audit.pk).exists())

        # 12 ans → purgé.
        ancient = AdminAuditLog.objects.create(
            actor=None, action=AdminAuditLog.Action.USER_UPDATE, object_type="y",
        )
        AdminAuditLog.objects.filter(pk=ancient.pk).update(
            created_at=timezone.now() - timedelta(days=365 * 12),
        )
        run_purge(dry_run=False)
        self.assertFalse(AdminAuditLog.objects.filter(pk=ancient.pk).exists())

    def test_mission_and_absence_purged_by_date_end(self):
        long_ago = (timezone.now() - timedelta(days=365 * 6)).date()
        m = Mission.objects.create(
            user=self.user, mission_type="FIELD",
            date_start=long_ago, date_end=long_ago,
        )
        a = AbsenceRequest.objects.create(
            user=self.user, absence_type="VACATION",
            date_start=long_ago, date_end=long_ago,
        )
        run_purge(dry_run=False)
        self.assertFalse(Mission.objects.filter(pk=m.pk).exists())
        self.assertFalse(AbsenceRequest.objects.filter(pk=a.pk).exists())

    def test_alert_purged_by_created_at(self):
        sess = self._aged_session(years_ago=6)
        alert = Alert.objects.create(
            user=self.user, session=sess,
            kind=Alert.Kind.FORGOTTEN_CLOCKOUT, message="x",
        )
        # alert.created_at est récent (auto_now_add) → on le force vieux.
        Alert.objects.filter(pk=alert.pk).update(
            created_at=timezone.now() - timedelta(days=365 * 6),
        )
        run_purge(dry_run=False)
        self.assertFalse(Alert.objects.filter(pk=alert.pk).exists())
