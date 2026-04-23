"""Helpers de comptabilisation du trajet professionnel (Art. 13 al. 3 OLT 1).

Convention métier : **un trajet A/R compensable par jour** où l'employé a
au moins une session sur la mission FIELD. Si plusieurs sessions sur la même
mission le même jour → 1 seul A/R (un employé ne se téléporte pas chez lui
entre deux sessions de la même mission). Si plusieurs missions distinctes
le même jour → les A/R s'additionnent (déplacements distincts).

Centralisé ici pour que `compute_overtime`, `DayDetailView`,
`UserMonthlyDetailView`, `build_monthly_rows` et `MissionSerializer`
utilisent EXACTEMENT la même logique. Toute évolution future (ex: split
demi-journée) ne touche qu'à un endroit.
"""
from __future__ import annotations

from datetime import date as date_type, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from apps.users.models import UserProfile


def daily_travel_compensable_minutes(user: "UserProfile", day: date_type) -> int:
    """Somme des compensables A/R des missions FIELD approuvées
    avec au moins une session de l'utilisateur ce jour-là.

    Une mission donnée n'est comptée qu'UNE fois par jour, même si plusieurs
    sessions sont rattachées à elle (un seul aller-retour domicile↔mission).
    """
    from apps.clocking.models import ClockSession
    from apps.missions.models import Mission

    mission_ids = (
        ClockSession.objects.filter(
            user=user, clock_in__date=day, mission__isnull=False,
        )
        .values_list("mission_id", flat=True)
        .distinct()
    )
    if not mission_ids:
        return 0
    qs = Mission.objects.filter(
        pk__in=list(mission_ids),
        mission_type=Mission.Type.FIELD,
        status=Mission.Status.APPROVED,
    ).values_list("travel_minutes_compensable", flat=True)
    return sum(v or 0 for v in qs)


def period_travel_compensable_minutes(
    user: "UserProfile", start: date_type, end: date_type,
) -> int:
    """Somme du compensable sur la fenêtre [start, end] inclusive.

    Itère jour par jour pour respecter la convention "1 A/R par jour avec
    session". Un jour sans session = 0 (pas de trajet).
    """
    total = 0
    cur = start
    while cur <= end:
        total += daily_travel_compensable_minutes(user, cur)
        cur += timedelta(days=1)
    return total


def mission_total_compensable_minutes(mission) -> int:
    """Compensable total d'une mission = compensable_par_jour × nombre de jours
    distincts avec au moins une session.

    Utilisé par `MissionSerializer.time_spent_minutes` pour afficher le total
    correct dans la fiche mission.
    """
    if not mission.travel_minutes_compensable:
        return 0
    distinct_days = (
        mission.sessions.values_list("clock_in__date", flat=True).distinct().count()
    )
    return int(mission.travel_minutes_compensable) * int(distinct_days)
