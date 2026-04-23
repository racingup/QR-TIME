"""Audit logging helpers — LPD Art. 12 (registre) + Art. 8 (sécurité)."""
from __future__ import annotations

from typing import Any


def log_admin_action(
    *,
    actor,
    action: str,
    target_user=None,
    object_type: str = "",
    object_id: Any = "",
    details: dict | None = None,
    request=None,
):
    """Append-only audit row. Imported lazily to avoid circular deps."""
    from apps.users.models import AdminAuditLog

    AdminAuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_user=target_user,
        object_type=object_type,
        object_id=str(object_id) if object_id != "" else "",
        details=details or {},
        ip_address=_client_ip(request) if request else None,
    )


def _client_ip(request) -> str | None:
    if not request:
        return None
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def manager_user_scope(manager):
    """Retourne le QuerySet des UserProfile que ce manager peut consulter.

    Hiérarchie stricte : superuser (admin) > manager > employé.

    Règles :
      - superuser → tous les utilisateurs actifs (lui-même compris)
      - manager avec home_site défini → utilisateurs actifs du même site,
        **superusers exclus** (un manager n'a jamais visibilité sur un admin)
      - manager sans home_site → tous les utilisateurs actifs sauf les superusers
      - utilisateur lambda → uniquement lui-même

    Cette fonction centralise le cantonnement par site (point 9) ET
    la hiérarchie admin > manager.
    """
    from apps.users.models import UserProfile
    qs = UserProfile.objects.filter(is_active=True)
    if not manager:
        return qs.none()
    if manager.is_superuser:
        return qs
    if not manager.is_manager:
        return qs.filter(pk=manager.pk)
    # Manager : on exclut TOUS les superusers (admin > manager).
    qs = qs.exclude(is_superuser=True)
    if manager.home_site_id:
        return qs.filter(home_site_id=manager.home_site_id)
    return qs


def can_manager_act_on(actor, target_user_id) -> bool:
    """True si l'acteur peut écrire (édit / approve / reject / régularise) sur
    les données de target_user_id.

    Règle stricte :
      - superuser → toujours True (peut tout, y compris se gérer lui-même)
      - manager / mission_manager → False sur soi-même (PAS d'auto-action)
                                  + False si target est superuser (hiérarchie)
                                  + cible doit être dans son scope visible
      - employé → False (pas d'écriture sur les données d'un tiers)

    Cette règle est CENTRALE et doit être respectée par TOUS les endpoints
    qui modifient des données : ClockSessionUpdateView, RegularizeSessionView,
    ManualClockSessionView, MissionApprove/Reject/Update, AbsenceApprove/Reject/Update.
    """
    if not actor or not getattr(actor, "is_authenticated", False):
        return False
    if actor.is_superuser:
        return True
    try:
        target_id = int(target_user_id) if target_user_id is not None else None
    except (TypeError, ValueError):
        return False
    if target_id is None:
        return False
    if target_id == actor.id:
        return False  # Anti-self : un manager n'agit jamais sur lui-même.
    return manager_user_scope(actor).filter(pk=target_id).exists()


def _next_deleted_username() -> str:
    """Renvoie le prochain identifiant `deleted_N` libre (N = 1, 2, 3...).

    Calcule N à partir des usernames existants `deleted_<digits>` et prend
    `max + 1`. Race condition gérée par retry sur IntegrityError côté appelant.
    """
    import re
    from django.db.models import Max
    from apps.users.models import UserProfile

    existing = UserProfile.objects.filter(
        username__regex=r"^deleted_\d+$",
    ).values_list("username", flat=True)
    nums = []
    pattern = re.compile(r"^deleted_(\d+)$")
    for u in existing:
        m = pattern.match(u)
        if m:
            nums.append(int(m.group(1)))
    n = (max(nums) + 1) if nums else 1
    return f"deleted_{n}"


def anonymize_user(user) -> None:
    """Pseudonymise un compte au lieu de le supprimer (Art. 32 al. 2 LPD + Art. 73 OLT 1).

    Les pointages, missions, absences sont conservés (obligation de tenue des
    enregistrements du temps de travail Art. 73 OLT 1, pièces comptables
    Art. 958f CO) mais rattachés à un compte renommé `deleted_N` (incrément
    monotone — `deleted_1`, `deleted_2`, ...). L'`id` interne est PRÉSERVÉ
    afin que les rapports historiques restent rattachables.

    L'email, le nom, le prénom sont vidés ; le mot de passe est rendu inutilisable
    et le compte désactivé.
    """
    from django.db import IntegrityError, transaction

    # Retry court : course possible si deux anonymisations simultanées (rare).
    for _attempt in range(5):
        try:
            with transaction.atomic():
                user.username = _next_deleted_username()
                user.first_name = ""
                user.last_name = ""
                user.email = ""
                user.is_active = False
                user.set_unusable_password()
                user.save()
            return
        except IntegrityError:
            continue
    # Dernier recours : suffixe pk pour garantir l'unicité.
    user.username = f"deleted_pk{user.id}"
    user.first_name = ""
    user.last_name = ""
    user.email = ""
    user.is_active = False
    user.set_unusable_password()
    user.save()
