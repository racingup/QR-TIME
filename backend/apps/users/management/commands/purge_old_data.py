"""Purge data older than the LPD retention window.

Politique (cf. settings.RETENTION_TIME_DATA_YEARS / RETENTION_AUDIT_LOG_YEARS) :
  - ClockSession    → date-pivot `clock_in`        (5 ans par défaut)
  - Mission         → date-pivot `date_end`        (5 ans par défaut)
  - AbsenceRequest  → date-pivot `date_end`        (5 ans par défaut)
  - Alert           → date-pivot `created_at`      (5 ans par défaut)
  - AdminAuditLog   → date-pivot `created_at`     (10 ans par défaut)

Usage :
    python manage.py purge_old_data --dry-run   # ne supprime rien, affiche
    python manage.py purge_old_data             # supprime, écrit AdminAuditLog

L'opération elle-même est journalisée dans AdminAuditLog (action=DATA_PURGED)
afin de prouver à un audit externe que la rétention est appliquée.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Purge les données dépassant la fenêtre de rétention LPD."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Affiche ce qui serait supprimé sans rien toucher.",
        )

    def handle(self, *args, dry_run: bool = False, **opts):
        result = run_purge(dry_run=dry_run)
        prefix = "[DRY-RUN] " if dry_run else ""
        for label, count in result["counts"].items():
            self.stdout.write(f"{prefix}{label:30s} → {count} ligne(s)")
        self.stdout.write(self.style.SUCCESS(
            f"{prefix}cutoff_time_data={result['cutoff_time_data']}  "
            f"cutoff_audit={result['cutoff_audit']}",
        ))


def run_purge(dry_run: bool = False) -> dict:
    """Exécute la purge. Retourne un dict {counts, cutoffs} pour l'audit.

    Importée par la commande de management ET par la tâche Celery.
    """
    from apps.absences.models import AbsenceRequest
    from apps.clocking.models import Alert, ClockSession
    from apps.missions.models import Mission
    from apps.users.models import AdminAuditLog

    now = timezone.now()
    cutoff_time = now - timedelta(days=365 * settings.RETENTION_TIME_DATA_YEARS)
    cutoff_audit = now - timedelta(days=365 * settings.RETENTION_AUDIT_LOG_YEARS)

    # On compte AVANT la suppression — chaque queryset ci-dessous est lazy,
    # `.count()` exécute donc avant que `.delete()` ne vide la table.
    targets = {
        "ClockSession (clock_in<cutoff)": ClockSession.objects.filter(
            clock_in__lt=cutoff_time,
        ),
        "Mission (date_end<cutoff)": Mission.objects.filter(
            date_end__lt=cutoff_time.date(),
        ),
        "AbsenceRequest (date_end<cutoff)": AbsenceRequest.objects.filter(
            date_end__lt=cutoff_time.date(),
        ),
        "Alert (created_at<cutoff)": Alert.objects.filter(
            created_at__lt=cutoff_time,
        ),
        "AdminAuditLog (created_at<cutoff)": AdminAuditLog.objects.filter(
            created_at__lt=cutoff_audit,
        ),
    }
    counts = {label: qs.count() for label, qs in targets.items()}

    # ── GPS minimisation (Art. 6 al. 4 LPD) ──────────────────────────
    # La politique de confidentialité promet un effacement des coordonnées
    # GPS après 12 mois maximum. On les nullifie sans supprimer la session.
    cutoff_gps = now - timedelta(days=365)
    gps_qs = ClockSession.objects.filter(
        clock_in__lt=cutoff_gps,
    ).exclude(
        gps_lat_in__isnull=True,
        gps_lon_in__isnull=True,
        gps_lat_out__isnull=True,
        gps_lon_out__isnull=True,
    )
    counts["GPS coords nullified (>12 months)"] = gps_qs.count()

    if not dry_run:
        gps_qs.update(
            gps_lat_in=None, gps_lon_in=None,
            gps_lat_out=None, gps_lon_out=None,
        )
        for qs in targets.values():
            qs.delete()
        # Trace meta : la purge elle-même fait l'objet d'une entrée audit.
        # C'est le seul endroit où le système écrit un AdminAuditLog sans
        # acteur (action automatique).
        AdminAuditLog.objects.create(
            actor=None,
            action=AdminAuditLog.Action.DATA_PURGED,
            object_type="retention_sweep",
            details={
                "counts": counts,
                "cutoff_time_data": cutoff_time.isoformat(),
                "cutoff_audit": cutoff_audit.isoformat(),
                "retention_time_data_years": settings.RETENTION_TIME_DATA_YEARS,
                "retention_audit_log_years": settings.RETENTION_AUDIT_LOG_YEARS,
            },
        )

    return {
        "counts": counts,
        "cutoff_time_data": cutoff_time.isoformat(),
        "cutoff_audit": cutoff_audit.isoformat(),
        "dry_run": dry_run,
    }
