"""Verrou mensuel — point unique de décision.

Avant : la logique était dupliquée dans `apps/clocking/views.py` (inline)
et `apps/absences/views.py` (`_check_month_lock`). Cohérence garantie ici.

Politique :
  1. superuser ou `user.can_edit_locked_months=True` → bypass total
  2. `WorkTimePolicy.lock_bypass_roles == "any"` → tout authentifié
  3. `WorkTimePolicy.lock_bypass_roles == "manager"` + is_manager → bypass
  4. Sinon : si on est passé le `month_lock_day` du mois courant et que
     l'objet appartient au mois précédent → bloqué.
"""
from __future__ import annotations

from datetime import date as date_type

from django.utils import timezone


def is_month_locked(user, obj_date: date_type) -> bool:
    """True si l'utilisateur ne peut PAS modifier des données à cette date."""
    if user.is_superuser or getattr(user, "can_edit_locked_months", False):
        return False
    from apps.users.models import WorkTimePolicy
    policy = WorkTimePolicy.load()
    if policy.lock_bypass_roles == "any":
        return False
    if policy.lock_bypass_roles == "manager" and getattr(user, "is_manager", False):
        return False
    today = timezone.localdate()
    if today.day > policy.month_lock_day:
        cutoff = today.replace(day=1)
        if obj_date < cutoff:
            return True
    return False


def check_month_lock(user, obj_date: date_type) -> None:
    """Raise PermissionDenied avec message standardisé si verrouillé."""
    from django.core.exceptions import PermissionDenied
    from apps.users.models import WorkTimePolicy
    if is_month_locked(user, obj_date):
        policy = WorkTimePolicy.load()
        raise PermissionDenied(
            f"Les modifications sont bloquées après le {policy.month_lock_day} "
            f"du mois. Contactez un administrateur."
        )
