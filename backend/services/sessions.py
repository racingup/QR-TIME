"""Helpers de calcul sur les ClockSession.

Trois fonctions critiques :

1. `merged_worked_minutes(sessions)` : retourne les minutes travaillées
   comme **union d'intervalles**. Évite la double comptabilisation lorsque
   deux pointages se chevauchent (ex : ajout manuel d'une sous-période à
   l'intérieur d'une session déjà fermée).

2. `find_overlapping_session(user_id, clock_in, clock_out, exclude_pk=None)` :
   retourne la 1ʳᵉ session qui chevauche l'intervalle proposé, ou None.
   Utilisé pour rejeter en amont les chevauchements à la création/édition.

3. `sessions_overlapping_day(user, date)` + `worked_minutes_on_day(user, date)` :
   gère les sessions qui traversent minuit. Un pointage 23:30 → 01:00
   compte pour 30 min sur le jour 1 ET 60 min sur le jour 2.

Une session ouverte (clock_out is None) est traitée comme couvrant
jusqu'à `clock_in + 24h` pour le calcul de chevauchement — cela permet
de bloquer la création d'un pointage tant qu'une session est ouverte.
"""
from __future__ import annotations

from datetime import date as date_type, datetime, time, timedelta
from typing import Iterable, Optional

from django.utils import timezone


def _interval_of(session) -> Optional[tuple[datetime, datetime]]:
    """Retourne l'intervalle (start, end) effectif d'une session.

    Préfère les valeurs arrondies (utilisées pour les calculs métier),
    fallback sur les valeurs brutes. Une session sans `clock_out` ouverte
    est ignorée (pas de durée travaillée).
    """
    start = getattr(session, "clock_in_rounded", None) or session.clock_in
    end = getattr(session, "clock_out_rounded", None) or getattr(session, "clock_out", None)
    if start is None or end is None:
        return None
    if end <= start:
        return None
    return (start, end)


def merged_worked_minutes(sessions: Iterable) -> int:
    """Union des intervalles → minutes travaillées totales.

    Si trois sessions chevauchent (ex : [9:00, 12:45], [13:30, 19:00],
    [14:00, 14:50]), la fonction renvoie la durée de l'union, pas la
    somme des durées individuelles : 3h45 + 5h30 = 9h15 (et pas 10h05).
    """
    intervals: list[tuple[datetime, datetime]] = []
    for s in sessions:
        iv = _interval_of(s)
        if iv:
            intervals.append(iv)
    if not intervals:
        return 0
    intervals.sort(key=lambda x: x[0])
    merged: list[list[datetime]] = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            if end > merged[-1][1]:
                merged[-1][1] = end
        else:
            merged.append([start, end])
    total_seconds = sum((end - start).total_seconds() for start, end in merged)
    return int(total_seconds // 60)


def find_overlapping_session(
    user_id: int,
    clock_in: datetime,
    clock_out: Optional[datetime],
    exclude_pk: Optional[int] = None,
):
    """Retourne la 1ʳᵉ ClockSession qui chevauche l'intervalle proposé, ou None.

    Logique : deux intervalles [a, b] et [c, d] se chevauchent ssi
    `a < d ET c < b`. On exclut la session elle-même lors d'une édition
    via `exclude_pk`.
    """
    from apps.clocking.models import ClockSession  # import local (éviter cycle)

    # Pour une session ouverte (clock_out=None), on considère qu'elle
    # couvre jusqu'à clock_in + 24h. Cela bloque tout nouveau pointage
    # tant que l'utilisateur n'a pas fermé la session ouverte.
    proposed_end = clock_out or (clock_in + timedelta(hours=24))

    qs = ClockSession.objects.filter(
        user_id=user_id,
        clock_in__lt=proposed_end,
    )
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)

    for s in qs:
        existing_start = s.clock_in
        existing_end = s.clock_out or (s.clock_in + timedelta(hours=24))
        # Chevauchement strict : on tolère le contact (out de A == in de B).
        if existing_start < proposed_end and clock_in < existing_end:
            return s
    return None


def sessions_overlapping_day(user, day: date_type):
    """Retourne les sessions qui ont au moins une minute sur le jour donné.

    Inclut les sessions qui démarrent la veille et se terminent ce jour-là
    (pointage de nuit), et celles qui débutent ce jour et se terminent
    le lendemain.

    Optim : filtre 100% en SQL via Q(clock_out__gt=day_start) | Q(clock_out__isnull=True).
    Le filtre Python sur clock_out_rounded est conservé en post-traitement
    léger (la majorité des sessions n'ont pas de rounded distinct).
    """
    from django.db.models import Q

    tz = timezone.get_current_timezone()
    day_start = timezone.make_aware(datetime.combine(day, time.min), tz)
    day_end = day_start + timedelta(days=1)

    qs = user.sessions.filter(
        Q(clock_in__lt=day_end)
        & (Q(clock_out__gt=day_start) | Q(clock_out__isnull=True))
    )
    # Affinage : tenir compte de clock_out_rounded si défini (peut différer).
    return [
        s for s in qs
        if (s.clock_out_rounded or s.clock_out or (s.clock_in + timedelta(hours=24))) > day_start
    ]


def apply_break_deduction(minutes: int, policy=None) -> int:
    """Applique la déduction automatique de pause si active dans la policy.

    Logique alignée sur `services.overtime.compute_overtime` (qui fait
    la même déduction pour le calcul des heures sup). Externalisée ici
    pour que les VUES D'AFFICHAGE (MeSummary, DayDetail, ManagerTeam…)
    montrent le temps NET, cohérent avec le solde sup affiché.

    Sans ça : le card "Règles actives" affichait « Pause auto : −30 min »
    mais le compteur d'heures travaillées restait identique au brut → bug.
    """
    if policy is None:
        from apps.users.models import WorkTimePolicy
        policy = WorkTimePolicy.load()
    if not policy.auto_deduct_break:
        return minutes
    if minutes < policy.break_trigger_minutes:
        return minutes
    deduction = max(0, policy.break_duration_minutes - policy.paid_break_minutes)
    return max(0, minutes - deduction)


def worked_minutes_on_day(user, day: date_type, *, apply_policy: bool = False) -> int:
    """Minutes travaillées pour un jour donné, en tronquant les sessions
    qui traversent minuit à [00:00, 24:00[ du jour.

    Combine également l'union d'intervalles pour éviter les double-comptages
    sur des sessions chevauchantes.
    """
    tz = timezone.get_current_timezone()
    day_start = timezone.make_aware(datetime.combine(day, time.min), tz)
    day_end = day_start + timedelta(days=1)

    intervals: list[tuple[datetime, datetime]] = []
    for s in sessions_overlapping_day(user, day):
        iv = _interval_of(s)
        if iv is None:
            continue
        start, end = iv
        # Tronquer au jour
        start = max(start, day_start)
        end = min(end, day_end)
        if end > start:
            intervals.append((start, end))
    if not intervals:
        return 0
    intervals.sort(key=lambda x: x[0])
    merged: list[list[datetime]] = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            if end > merged[-1][1]:
                merged[-1][1] = end
        else:
            merged.append([start, end])
    total_seconds = sum((end - start).total_seconds() for start, end in merged)
    minutes = int(total_seconds // 60)
    if apply_policy:
        minutes = apply_break_deduction(minutes)
    return minutes
