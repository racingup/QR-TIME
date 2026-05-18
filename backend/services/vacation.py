"""Recalcul du compteur `vacation_used` à partir des absences en base.

Le champ `UserProfile.vacation_used` est dénormalisé pour l'affichage rapide,
mais doit toujours refléter la somme des absences VACATION approuvées
moins les jours recrédités par des SICK chevauchants.

Cette fonction recompute le compteur de manière déterministe et idempotente
pour éviter toute dérive (oubli d'incrément à l'approbation, edit qui ne
recalcule pas, rejet d'une SICK qui avait déclenché un recrédit…).
"""
from __future__ import annotations

from decimal import Decimal


def recompute_vacation_used(user) -> Decimal:
    """Recompute and persist `user.vacation_used` from approved absences.

    Logique :
      total = somme des `days_count` des absences VACATION APPROVED de l'année courante
              − somme des jours de SICK APPROVED qui chevauchent une VACATION
                APPROVED (recrédit GAZNAT)

    Note : on borne au quota minimum 0 (un drift négatif serait illogique).
    """
    from apps.absences.models import AbsenceRequest
    from django.utils import timezone

    year = timezone.localdate().year

    vacations = AbsenceRequest.objects.filter(
        user=user,
        absence_type=AbsenceRequest.AbsenceType.VACATION,
        status=AbsenceRequest.Status.APPROVED,
        date_start__year=year,
    )
    used = Decimal("0")
    for v in vacations:
        used += Decimal(str(v.days_count))

    # Recrédit GAZNAT : pour chaque SICK approuvée chevauchant une VACATION,
    # on retire au prorata du recouvrement.
    sicks = AbsenceRequest.objects.filter(
        user=user,
        absence_type=AbsenceRequest.AbsenceType.SICK,
        status=AbsenceRequest.Status.APPROVED,
        date_start__year=year,
    )
    for s in sicks:
        overlapping = vacations.filter(
            date_start__lte=s.date_end,
            date_end__gte=s.date_start,
        )
        for v in overlapping:
            # Recouvrement en nombre de jours civils communs
            overlap_start = max(s.date_start, v.date_start)
            overlap_end = min(s.date_end, v.date_end)
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                used -= Decimal(str(overlap_days))

    used = max(Decimal("0"), used)
    if user.vacation_used != used:
        user.vacation_used = used
        user.save(update_fields=["vacation_used"])
    return used
