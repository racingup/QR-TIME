"""Celery tasks for the clocking app."""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.clocking.models import Alert, ClockSession

logger = logging.getLogger(__name__)


@shared_task(name="apps.clocking.tasks.detect_forgotten_clockouts")
def detect_forgotten_clockouts() -> dict:
    """Find today's still-open ClockSessions, mark them forgotten, raise alerts.

    Idempotent: rerunning the task does not duplicate alerts (guarded by the
    UniqueConstraint on Alert(kind, session)).

    Emails are sent once per new alert (only on first detection):
    - to the employee if they have an email address and are active
    - to their direct manager (or all active managers if no direct manager set)

    Returns a dict with `flagged`, `alerts_created`, and `emails_sent` counters.
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
    ).select_related("user", "user__manager")

    flagged = 0
    alerts_created = 0
    emails_sent = 0
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
            sent = _send_forgotten_clockout_emails(session)
            emails_sent += sent

    logger.info(
        "detect_forgotten_clockouts: scanned=%d flagged=%d alerts_created=%d emails_sent=%d",
        open_today.count(), flagged, alerts_created, emails_sent,
    )
    return {
        "scanned": open_today.count(),
        "flagged": flagged,
        "alerts_created": alerts_created,
        "emails_sent": emails_sent,
    }


def _send_forgotten_clockout_emails(session: ClockSession) -> int:
    """Send email to employee when a forgotten clockout is detected.

    Returns the number of employee emails successfully sent (0 or 1).
    Manager notifications are sent separately and not counted in the return value.
    """
    from apps.users.models import UserProfile

    user = session.user
    clock_in_str = session.clock_in.strftime("%H:%M")
    date_str = session.clock_in.strftime("%d/%m/%Y")
    site_url = getattr(settings, "SITE_PUBLIC_URL", "")
    sent = 0

    # ── Email to the employee (only if active + has email) ───────────────
    if user.is_active and user.email:
        send_mail(
            subject=f"[QR-TIME] Vous avez oublié de pointer votre sortie",
            message=(
                f"Bonjour {user.get_username()},\n\n"
                f"Vous avez oublié de pointer votre sortie le {date_str} "
                f"(arrivée à {clock_in_str}).\n\n"
                f"Veuillez régulariser votre pointage depuis l'application :\n"
                f"{site_url}\n\n"
                f"Cordialement,\nQR-TIME"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
        sent = 1

    # ── Email to the manager (best-effort, not counted) ──────────────────
    mgr = getattr(user, "manager", None)
    if mgr and mgr.email and mgr.is_active:
        manager_recipients = [mgr.email]
    else:
        manager_recipients = list(
            UserProfile.objects.filter(is_manager=True, is_active=True)
            .exclude(email="")
            .values_list("email", flat=True)[:20]
        )
    if manager_recipients:
        send_mail(
            subject=f"[QR-TIME] Alerte oubli de pointage — {user.get_username()}",
            message=(
                f"L'employé {user.get_username()} a oublié de pointer sa sortie le {date_str} "
                f"(arrivée à {clock_in_str}).\n\n"
                f"Une alerte a été créée dans QR-TIME :\n{site_url}\n\n"
                f"Cordialement,\nQR-TIME"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=manager_recipients,
            fail_silently=True,
        )

    return sent
