"""Celery tasks for the clocking app."""
from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.clocking.models import Alert, ClockSession

logger = logging.getLogger(__name__)


def _send_forgotten_email(session: ClockSession) -> bool:
    """Envoie un mail de rappel à l'utilisateur. Retourne True si envoyé.

    Best-effort : n'envoie que si l'utilisateur a une adresse email configurée
    et n'est pas anonymisé (compte actif). Une exception SMTP n'interrompt
    PAS la tâche — on log et on continue avec les autres sessions.
    """
    user = session.user
    if not user.email or not user.is_active:
        return False
    arrival = timezone.localtime(session.clock_in)
    public_url = getattr(settings, "SITE_PUBLIC_URL", "").rstrip("/")
    deep_link = f"{public_url}/" if public_url else ""
    subject = "[qrtime.ch] Vous avez oublié de pointer votre sortie"
    body = (
        f"Bonjour {user.first_name or user.get_username()},\n\n"
        f"Notre système n'a pas reçu votre pointage de sortie pour la session "
        f"commencée le {arrival:%d.%m.%Y} à {arrival:%H:%M}.\n\n"
        f"Merci de régulariser votre journée dès que possible :\n"
        f"  {deep_link}\n\n"
        f"Si la session est correcte (vous travaillez encore), vous pouvez "
        f"l'ignorer — elle se clôturera à votre prochain pointage.\n\n"
        f"— qrtime.ch (message automatique, ne pas répondre)"
    )
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=None,  # utilise DEFAULT_FROM_EMAIL
            recipient_list=[user.email],
            fail_silently=False,
        )
        return True
    except Exception as exc:  # noqa: BLE001 — best effort, on log et on continue
        logger.warning(
            "forgotten reminder mail FAILED user=%s session=%s err=%s",
            user.id, session.id, exc,
        )
        return False


@shared_task(name="apps.clocking.tasks.detect_forgotten_clockouts")
def detect_forgotten_clockouts() -> dict:
    """Find today's still-open ClockSessions, mark them forgotten, raise alerts.

    Idempotent: rerunning the task does not duplicate alerts (guarded by the
    UniqueConstraint on Alert(kind, session)). Sends an email to the user the
    FIRST time a session is detected as forgotten — re-runs ne re-spamment pas.
    """
    today = timezone.localdate()
    open_today = ClockSession.objects.filter(
        clock_out__isnull=True,
        clock_in__date=today,
    ).select_related("user")

    flagged = 0
    alerts_created = 0
    emails_sent = 0
    for session in open_today:
        if not session.is_forgotten:
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
            # Email envoyé UNIQUEMENT lors de la création initiale de l'Alert.
            # Garantit qu'un employé ne reçoit pas un mail à chaque rerun de
            # la tâche (idempotence côté boîte mail).
            if _send_forgotten_email(session):
                emails_sent += 1

    logger.info(
        "detect_forgotten_clockouts: scanned=%d flagged=%d alerts=%d mails=%d",
        open_today.count(), flagged, alerts_created, emails_sent,
    )
    return {
        "scanned": open_today.count(),
        "flagged": flagged,
        "alerts_created": alerts_created,
        "emails_sent": emails_sent,
    }
