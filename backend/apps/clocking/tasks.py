"""Celery tasks for the clocking app."""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta

from celery import shared_task
from django.utils import timezone

from apps.clocking.models import Alert, ClockSession

logger = logging.getLogger(__name__)


@shared_task(name="apps.clocking.tasks.detect_forgotten_clockouts")
def detect_forgotten_clockouts() -> dict:
    """Find today's still-open ClockSessions, mark them forgotten, raise alerts.

    Idempotent: rerunning the task does not duplicate alerts (guarded by the
    UniqueConstraint on Alert(kind, session)).
    """
    tz = timezone.get_current_timezone()
    today = timezone.localdate()
    day_start = timezone.make_aware(datetime.combine(today, time.min), tz)
    day_end = day_start + timedelta(days=1)
    open_today = ClockSession.objects.filter(
        clock_out__isnull=True,
        is_forgotten=False,
        clock_in__gte=day_start,
        clock_in__lt=day_end,
    ).select_related("user")

    flagged = 0
    alerts_created = 0
    for session in open_today:
        session.is_forgotten = True
        session.save(update_fields=["is_forgotten"])
        flagged += 1
        _, created = Alert.objects.get_or_create(
            kind=Alert.Kind.FORGOTTEN_CLOCKOUT,
            session=session,
            defaults={
                "user": session.user,
                "message": (
                    f"{session.user.get_username()} n'a pas pointé sa sortie "
                    f"(arrivée à {session.clock_in:%H:%M})."
                ),
            },
        )
        if created:
            alerts_created += 1

    logger.info(
        "detect_forgotten_clockouts: scanned=%d flagged=%d alerts_created=%d",
        open_today.count(), flagged, alerts_created,
    )
    return {
        "scanned": open_today.count(),
        "flagged": flagged,
        "alerts_created": alerts_created,
    }
