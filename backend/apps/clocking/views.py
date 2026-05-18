"""Clocking endpoints (scan + history)."""
from __future__ import annotations

from datetime import date as date_type

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework import viewsets

from apps.clocking.models import ClockSession, FixedTimeSlot
from apps.clocking.serializers import (
    ClockSessionSerializer,
    FixedTimeSlotSerializer,
    ScanRequestSerializer,
)
from apps.missions.models import Mission
from apps.users.models import Site, ToleranceConfig
from apps.users.permissions import IsManager, IsSuperUser
from services.fixed_slots import requires_justification
from services.geo import haversine
from services.overtime import compute_overtime
from services.rounding import apply_rounding


class ScanView(APIView):
    """POST /api/clock/scan/ — QR scan + GPS → clock in / clock out."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        payload = ScanRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        qr_token: str = data["qr_token"]
        gps_lat = data.get("gps_lat")
        gps_lon = data.get("gps_lon")
        justification: str = data.get("justification") or ""
        user = request.user
        now = timezone.now()
        today: date_type = timezone.localdate(now)

        # ── Exempt-from-clocking guard ─────────────────────────────────
        if getattr(user, "exempt_from_clocking", False):
            return Response(
                {
                    "error": "EXEMPT_FROM_CLOCKING",
                    "detail": (
                        "Vous n'êtes pas soumis au timbrage. "
                        "Votre présence est validée via la planification."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # ── Resolve token: Site OR Mission ─────────────────────────────
        site = Site.objects.filter(qr_code_token=qr_token).first()
        mission = None
        if site is None:
            mission = Mission.objects.filter(qr_token=qr_token).first()
            if mission is None:
                return Response(
                    {"error": "TOKEN_NOT_FOUND"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            # Mission ownership + date validity + approval.
            if mission.user_id != user.id:
                return Response(
                    {"error": "MISSION_FORBIDDEN"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if mission.status != Mission.Status.APPROVED:
                return Response(
                    {"error": "MISSION_NOT_APPROVED"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not (mission.date_start <= today <= mission.date_end):
                return Response(
                    {"error": "MISSION_EXPIRED"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ── GPS validation ─────────────────────────────────────────────
        target_lat = target_lon = None
        radius_m = None
        if site is not None:
            target_lat, target_lon = float(site.latitude), float(site.longitude)
            radius_m = site.gps_radius_meters
        elif mission and mission.location_lat is not None and mission.gps_radius_meters:
            target_lat = float(mission.location_lat)
            target_lon = float(mission.location_lon)
            radius_m = mission.gps_radius_meters
        # else: REMOTE-style mission, no GPS check

        if radius_m is not None:
            if gps_lat is None or gps_lon is None:
                return Response(
                    {"error": "GPS_REQUIRED"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            distance = haversine(gps_lat, gps_lon, target_lat, target_lon)
            if distance > radius_m:
                return Response(
                    {
                        "error": "GPS_OUT_OF_RANGE",
                        "distance_m": int(round(distance)),
                        "allowed_m": radius_m,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ── Determine action from current state ────────────────────────
        open_session = (
            ClockSession.objects
            .filter(user=user, clock_out__isnull=True)
            .order_by("-clock_in")
            .first()
        )
        # Garde-fou : si l'employé a une session ouverte d'un JOUR
        # ANTÉRIEUR (oubli de pointage), on refuse le scan pour éviter
        # une fermeture incohérente (durée monstrueuse, calculs faux).
        # Il doit faire régulariser par son manager.
        if open_session and open_session.clock_in.date() < timezone.localdate():
            return Response(
                {
                    "error": "OPEN_SESSION_PREVIOUS_DAY",
                    "detail": (
                        f"Vous avez un pointage ouvert depuis le "
                        f"{open_session.clock_in:%d/%m/%Y à %H:%M}. "
                        f"Demandez à votre manager de régulariser cette "
                        f"session avant de pointer à nouveau."
                    ),
                    "open_session_id": open_session.pk,
                    "open_session_clock_in": open_session.clock_in.isoformat(),
                },
                status=status.HTTP_409_CONFLICT,
            )
        action = "OUT" if open_session else "IN"

        # ── Apply rounding ─────────────────────────────────────────────
        config = ToleranceConfig.load()
        rounded = apply_rounding(now, config)

        # ── Fixed-slot check ───────────────────────────────────────────
        slots = list(FixedTimeSlot.objects.filter(is_active=True))
        needs_justif = requires_justification(rounded, action, slots)
        if needs_justif and not justification:
            return Response(
                {"requires_justification": True, "action": action},
                status=status.HTTP_200_OK,
            )

        # ── Create or close the session ────────────────────────────────
        if action == "IN":
            session_type = (
                ClockSession.SessionType.MISSION if mission
                else ClockSession.SessionType.OFFICE
            )
            session = ClockSession.objects.create(
                user=user,
                clock_in=now,
                clock_in_rounded=rounded,
                session_type=session_type,
                site=site,
                mission=mission,
                gps_lat_in=gps_lat,
                gps_lon_in=gps_lon,
                justification=justification,
            )
        else:  # OUT
            session = open_session
            session.clock_out = now
            session.clock_out_rounded = rounded
            session.gps_lat_out = gps_lat
            session.gps_lon_out = gps_lon
            if justification:
                session.justification = (
                    f"{session.justification}\n{justification}".strip()
                )
            session.save()

            # Final clock_out of the day → reconcile overtime balance.
            # Reconciliation idempotente : on recompute la somme de tous
            # les jours pour éviter le double-comptage (cf. D8).
            still_open = ClockSession.objects.filter(
                user=user, clock_out__isnull=True,
            ).exists()
            if not still_open:
                from services.overtime import reconcile_overtime_balance
                reconcile_overtime_balance(user)

        body = ClockSessionSerializer(session).data
        body["action"] = action

        # ── Daily min/max warnings (clock-out only) ────────────────────
        if action == "OUT":
            from apps.users.models import WorkTimePolicy
            policy = WorkTimePolicy.load()
            closed_today = ClockSession.objects.filter(
                user=user,
                clock_in__date=today,
                clock_out_rounded__isnull=False,
            )
            from services.sessions import apply_break_deduction, merged_worked_minutes
            # Warnings min/max appliqués sur le temps NET (après déduction
            # automatique de pause si configurée) — cohérent avec l'affichage
            # et avec la logique de compute_overtime.
            today_worked = apply_break_deduction(
                merged_worked_minutes(closed_today), policy=policy,
            )
            warnings = []
            if policy.daily_min_minutes > 0 and today_worked < policy.daily_min_minutes:
                warnings.append({
                    "code": "DAILY_MIN_NOT_MET",
                    "detail": (
                        f"Temps travaillé ({today_worked} min) inférieur "
                        f"au minimum requis ({policy.daily_min_minutes} min)."
                    ),
                    "worked_minutes": today_worked,
                    "threshold_minutes": policy.daily_min_minutes,
                })
            if policy.daily_max_minutes > 0 and today_worked > policy.daily_max_minutes:
                warnings.append({
                    "code": "DAILY_MAX_EXCEEDED",
                    "detail": (
                        f"Temps travaillé ({today_worked} min) supérieur "
                        f"au maximum autorisé ({policy.daily_max_minutes} min)."
                    ),
                    "worked_minutes": today_worked,
                    "threshold_minutes": policy.daily_max_minutes,
                })
            body["warnings"] = warnings

        return Response(body, status=status.HTTP_200_OK)


class FixedTimeSlotViewSet(viewsets.ModelViewSet):
    """CRUD on FixedTimeSlot — superuser only (paramétrage admin)."""

    queryset = FixedTimeSlot.objects.all().order_by("start_time")
    serializer_class = FixedTimeSlotSerializer
    permission_classes = [IsSuperUser]


class TodaySessionsView(APIView):
    """GET /api/clock/today/ — sessions for the authenticated user, today."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        today = timezone.localdate(timezone.now())
        sessions = ClockSession.objects.filter(
            user=request.user, clock_in__date=today,
        ).order_by("clock_in")
        return Response(ClockSessionSerializer(sessions, many=True).data)


class DayDetailView(APIView):
    """GET /api/clock/day/?date=YYYY-MM-DD&user_id=N — full day context.

    Returns sessions, active mission(s), active absence(s), site holiday flag.
    Employees see their own day; managers can query any user_id.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from datetime import date as date_type
        from apps.absences.models import AbsenceRequest
        from apps.absences.serializers import AbsenceRequestSerializer
        from apps.missions.models import Mission
        from apps.missions.serializers import MissionSerializer
        from apps.users.models import SiteHoliday, UserProfile

        raw = request.query_params.get("date") or timezone.localdate().isoformat()
        try:
            target_date = date_type.fromisoformat(raw)
        except ValueError:
            return Response({"error": "INVALID_DATE"}, status=status.HTTP_400_BAD_REQUEST)

        target_user_id = request.query_params.get("user_id")
        if target_user_id and int(target_user_id) != request.user.id:
            if not (request.user.is_manager or request.user.is_superuser):
                return Response({"error": "FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN)
            user_id = int(target_user_id)
        else:
            user_id = request.user.id

        try:
            user = UserProfile.objects.get(pk=user_id)
        except UserProfile.DoesNotExist:
            return Response({"error": "USER_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        # Inclure les sessions qui démarrent la veille et se terminent ce
        # jour-là (pointage de nuit) ou inverse. La requête couvre les
        # bornes [day-1, day+1] puis on filtre/tronque côté Python.
        from services.sessions import sessions_overlapping_day, worked_minutes_on_day
        sessions_models = sessions_overlapping_day(user, target_date)
        # Tri par clock_in pour affichage cohérent
        sessions_models.sort(key=lambda s: s.clock_in)
        sessions = sessions_models  # noms cohérents avec la suite
        # apply_policy=True : déduit la pause auto pour cohérence affichage
        clocked_min = worked_minutes_on_day(user, target_date, apply_policy=True)
        # Trajet pro compensable (Art. 13 al. 3 OLT 1) — calculé au niveau
        # du jour pour ce user, à partir des sessions liées à des missions
        # FIELD approuvées. Voir `services/missions_travel.py`.
        from services.missions_travel import daily_travel_compensable_minutes
        travel_compensable = daily_travel_compensable_minutes(user, target_date)
        total_min = clocked_min + travel_compensable

        missions = Mission.objects.filter(
            user_id=user_id,
            status=Mission.Status.APPROVED,
            date_start__lte=target_date,
            date_end__gte=target_date,
        )
        absences = AbsenceRequest.objects.filter(
            user_id=user_id,
            status=AbsenceRequest.Status.APPROVED,
            date_start__lte=target_date,
            date_end__gte=target_date,
        )

        holiday = None
        if user.home_site_id:
            h = SiteHoliday.objects.filter(
                site_id=user.home_site_id, date=target_date,
            ).first()
            if h:
                holiday = {"name": h.name, "site_name": user.home_site.name}

        return Response({
            "date": target_date.isoformat(),
            "user_id": user_id,
            "username": user.get_username(),
            "sessions": ClockSessionSerializer(sessions, many=True).data,
            "total_minutes": total_min,
            "clocked_minutes": clocked_min,
            "travel_compensable_minutes": travel_compensable,
            "open_session": any(s.clock_out is None for s in sessions),
            "missions_active": MissionSerializer(missions, many=True).data,
            "absences_active": AbsenceRequestSerializer(absences, many=True).data,
            "holiday": holiday,
        })


class ManualClockSessionView(APIView):
    """POST /api/clock/manual/ — manager crée un pointage à la main pour un employé.

    Cas d'usage : un employé en mission n'a pas pu scanner / a oublié.
    Body : {user_id, clock_in (ISO), clock_out (ISO, optionnel),
            session_type (OFFICE|REMOTE|MISSION), site_id (optionnel),
            mission_id (optionnel), justification (optionnel)}
    """

    permission_classes = [IsManager]

    def post(self, request: Request) -> Response:
        from django.utils.dateparse import parse_datetime
        from apps.users.models import Site, UserProfile, AdminAuditLog
        from apps.missions.models import Mission
        from services.audit import log_admin_action

        data = request.data
        user_id = data.get("user_id")
        clock_in_raw = data.get("clock_in")
        if not user_id or not clock_in_raw:
            return Response(
                {"error": "MISSING_FIELDS", "required": ["user_id", "clock_in"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from services.audit import can_manager_act_on, manager_user_scope
        # Anti-self : un manager ne peut PAS créer un pointage manuel pour lui-même.
        if not can_manager_act_on(request.user, user_id):
            return Response(
                {"error": "FORBIDDEN_SELF_OR_OUT_OF_SCOPE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            user = manager_user_scope(request.user).get(pk=user_id)
        except UserProfile.DoesNotExist:
            return Response(
                {"error": "USER_NOT_FOUND_OR_OUT_OF_SCOPE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        clock_in = parse_datetime(clock_in_raw)
        clock_out_raw = data.get("clock_out")
        clock_out = parse_datetime(clock_out_raw) if clock_out_raw else None
        if clock_in is None or (clock_out_raw and clock_out is None):
            return Response({"error": "INVALID_DATETIME"}, status=status.HTTP_400_BAD_REQUEST)
        if clock_out and clock_out <= clock_in:
            return Response(
                {"error": "INVALID_RANGE", "hint": "clock_out must be > clock_in"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Garde-fou : pas de pointage de plus de 24h (anti-erreur de saisie
        # qui ferait exploser overtime). Au-delà, demander de scinder.
        if clock_out and (clock_out - clock_in).total_seconds() > 24 * 3600:
            return Response(
                {
                    "error": "SPAN_TOO_LONG",
                    "detail": (
                        "Un pointage manuel ne peut excéder 24h. "
                        "Veuillez créer deux pointages distincts."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Pas de pointage manuel dans le futur (> aujourd'hui + 1 jour).
        from datetime import timedelta as _td
        if clock_in > timezone.now() + _td(days=1):
            return Response(
                {"error": "FUTURE_TIMESTAMP",
                 "detail": "Un pointage ne peut être créé dans le futur."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Anti-chevauchement : un pointage ne peut pas se superposer ────
        # à un autre pointage du même employé (même partiellement).
        from services.sessions import find_overlapping_session
        overlapping = find_overlapping_session(user_id, clock_in, clock_out)
        if overlapping:
            end_str = (
                overlapping.clock_out.strftime("%H:%M")
                if overlapping.clock_out else "…"
            )
            return Response(
                {
                    "error": "OVERLAPPING_SESSION",
                    "detail": (
                        f"Un pointage existe déjà sur cette période "
                        f"({overlapping.clock_in.strftime('%H:%M')} → {end_str})."
                    ),
                    "overlapping_id": overlapping.pk,
                },
                status=status.HTTP_409_CONFLICT,
            )

        session_type = data.get("session_type", ClockSession.SessionType.OFFICE)
        if session_type not in dict(ClockSession.SessionType.choices):
            return Response({"error": "INVALID_SESSION_TYPE"}, status=status.HTTP_400_BAD_REQUEST)

        site = None
        if data.get("site_id"):
            try:
                site = Site.objects.get(pk=data["site_id"])
            except Site.DoesNotExist:
                return Response({"error": "SITE_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        mission = None
        if data.get("mission_id"):
            try:
                mission = Mission.objects.get(pk=data["mission_id"])
            except Mission.DoesNotExist:
                return Response({"error": "MISSION_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        session = ClockSession.objects.create(
            user=user,
            clock_in=clock_in,
            clock_in_rounded=clock_in,
            clock_out=clock_out,
            clock_out_rounded=clock_out,
            session_type=session_type,
            site=site,
            mission=mission,
            justification=data.get("justification", ""),
            justification_approved=True if data.get("justification") else None,
            is_forgotten=True,  # manuel = exception
        )
        log_admin_action(
            actor=request.user, action=AdminAuditLog.Action.SESSION_EDIT,
            target_user=user, object_type="ClockSession", object_id=session.id,
            details={"manual_creation": True, "session_type": session_type},
            request=request,
        )
        # Recalcul du solde heures sup (la création manuelle peut concerner
        # un jour déjà clôturé — on doit synchroniser le balance).
        from services.overtime import reconcile_overtime_balance
        reconcile_overtime_balance(user)
        return Response(ClockSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class ClockSessionUpdateView(APIView):
    """PATCH /api/clock/{id}/edit/ — manager / superuser can edit any session."""

    permission_classes = [IsManager]

    ALLOWED_FIELDS = {
        "clock_in", "clock_out",
        "clock_in_rounded", "clock_out_rounded",
        "justification", "justification_approved",
        "is_forgotten",
    }

    def patch(self, request: Request, pk: int) -> Response:
        from django.core.exceptions import PermissionDenied
        from django.utils.dateparse import parse_datetime
        from services.audit import can_manager_act_on
        from apps.users.models import WorkTimePolicy
        session = generics.get_object_or_404(ClockSession, pk=pk)
        if not can_manager_act_on(request.user, session.user_id):
            # Couvre : auto-édition (manager → ses propres pointages),
            # cible superuser, hors scope.
            return Response(
                {"error": "FORBIDDEN_SELF_OR_OUT_OF_SCOPE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Garde-fou : `clock_in` est NOT NULL côté DB. Refuser de l'effacer
        # explicitement plutôt que de planter en IntegrityError 500.
        # Pour supprimer la session, utiliser DELETE /api/clock/{id}/delete/.
        if "clock_in" in request.data and not request.data.get("clock_in"):
            return Response(
                {
                    "error": "CLOCK_IN_REQUIRED",
                    "hint": "Pour supprimer une session, utiliser "
                            "DELETE /api/clock/{id}/delete/ — pas un PATCH "
                            "qui vide les champs.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # ── Verrou mensuel (configurable) — délégué à services.month_lock ──
        from services.month_lock import is_month_locked
        # Bug D pré-audit : on doit vérifier tout horodatage qui peut affecter
        # la date du mois bloqué (clock_in OU clock_in_rounded), pas que clock_in.
        date_to_check = session.clock_in.date()
        if "clock_in_rounded" in request.data and request.data.get("clock_in_rounded"):
            from django.utils.dateparse import parse_datetime
            new_dt = parse_datetime(request.data["clock_in_rounded"])
            if new_dt:
                date_to_check = min(date_to_check, new_dt.date())
        if is_month_locked(request.user, date_to_check):
            policy = WorkTimePolicy.load()
            return Response(
                {"error": "MONTH_LOCKED",
                 "detail": f"Les modifications sont bloquées après le {policy.month_lock_day} du mois."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ── Track justification submission for email notification ────────
        had_justification_before = bool(session.justification)

        for key, value in request.data.items():
            if key not in self.ALLOWED_FIELDS:
                continue
            if key in ("clock_in", "clock_out", "clock_in_rounded", "clock_out_rounded"):
                value = parse_datetime(value) if value else None
            setattr(session, key, value)

        # ── Anti-chevauchement : refuser si le nouvel intervalle empiète ──
        # sur un autre pointage du même employé. On exclut la session
        # éditée elle-même de la vérification.
        if session.clock_in and (
            "clock_in" in request.data or "clock_out" in request.data
            or "clock_in_rounded" in request.data or "clock_out_rounded" in request.data
        ):
            from services.sessions import find_overlapping_session
            overlapping = find_overlapping_session(
                user_id=session.user_id,
                clock_in=session.clock_in,
                clock_out=session.clock_out,
                exclude_pk=session.pk,
            )
            if overlapping:
                end_str = (
                    overlapping.clock_out.strftime("%H:%M")
                    if overlapping.clock_out else "…"
                )
                return Response(
                    {
                        "error": "OVERLAPPING_SESSION",
                        "detail": (
                            f"Un pointage existe déjà sur cette période "
                            f"({overlapping.clock_in.strftime('%H:%M')} → {end_str})."
                        ),
                        "overlapping_id": overlapping.pk,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        session.save()

        # Notify managers when a justification is submitted for the first time.
        if not had_justification_before and session.justification:
            _notify_managers_justification(session, request.user)

        # Recalcul du solde heures sup si on touche aux horodatages.
        if {"clock_in", "clock_out", "clock_in_rounded", "clock_out_rounded"} & set(request.data.keys()):
            from services.overtime import reconcile_overtime_balance
            reconcile_overtime_balance(session.user)

        return Response(ClockSessionSerializer(session).data)


class ClockSessionDeleteView(APIView):
    """DELETE /api/clock/{id}/delete/ — supprime un pointage.

    Réservé aux managers / mission_managers / superusers, avec les règles
    standards :
      - anti-self : un manager ne supprime pas ses propres pointages
        (sauf superuser, qui peut tout)
      - hiérarchie : seul le superuser peut supprimer un pointage de superuser
      - cantonnement : un manager ne supprime que les pointages des users
        dans son scope (`manager_user_scope`)

    L'opération est tracée dans `AdminAuditLog` avec un snapshot de la session
    supprimée (LPD : preuve qu'une action destructrice a bien eu lieu et par qui).
    """

    permission_classes = [IsManager]

    def delete(self, request: Request, pk: int) -> Response:
        from apps.users.models import AdminAuditLog
        from services.audit import can_manager_act_on, log_admin_action
        session = generics.get_object_or_404(ClockSession, pk=pk)
        if not can_manager_act_on(request.user, session.user_id):
            return Response(
                {"error": "FORBIDDEN_SELF_OR_OUT_OF_SCOPE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Snapshot AVANT delete pour la trace audit (after-deletion les FKs
        # sont cassées et on perd toute info utile).
        snapshot = {
            "session_type": session.session_type,
            "clock_in": session.clock_in.isoformat() if session.clock_in else None,
            "clock_out": session.clock_out.isoformat() if session.clock_out else None,
            "site_id": session.site_id,
            "mission_id": session.mission_id,
            "is_forgotten": session.is_forgotten,
        }
        target_user = session.user
        session_id = session.id
        session.delete()
        log_admin_action(
            actor=request.user, action=AdminAuditLog.Action.SESSION_DELETE,
            target_user=target_user,
            object_type="ClockSession", object_id=session_id,
            details=snapshot,
            request=request,
        )
        # Recompute overtime balance après suppression.
        from services.overtime import reconcile_overtime_balance
        reconcile_overtime_balance(target_user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class HistoryView(APIView):
    """GET /api/clock/history/?month=YYYY-MM — month of sessions for the user.

    Alternate usage: `?start=YYYY-MM-DD&end=YYYY-MM-DD` for arbitrary ranges
    (used by the calendar to prefill session indicators in each cell).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from datetime import date as date_type
        raw_start = request.query_params.get("start")
        raw_end = request.query_params.get("end")
        if raw_start and raw_end:
            try:
                start = date_type.fromisoformat(raw_start)
                end_inclusive = date_type.fromisoformat(raw_end)
            except ValueError:
                return Response(
                    {"error": "INVALID_RANGE"}, status=status.HTTP_400_BAD_REQUEST,
                )
            sessions = ClockSession.objects.filter(
                user=request.user,
                clock_in__date__gte=start,
                clock_in__date__lte=end_inclusive,
            ).order_by("clock_in")
            return Response(ClockSessionSerializer(sessions, many=True).data)

        month_str = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            year, month = (int(x) for x in month_str.split("-"))
            start = date_type(year, month, 1)
        except (ValueError, TypeError):
            return Response(
                {"error": "INVALID_MONTH", "expected": "YYYY-MM"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if month == 12:
            end = date_type(year + 1, 1, 1)
        else:
            end = date_type(year, month + 1, 1)

        sessions = ClockSession.objects.filter(
            user=request.user,
            clock_in__date__gte=start,
            clock_in__date__lt=end,
        ).order_by("clock_in")
        return Response(ClockSessionSerializer(sessions, many=True).data)


class ManagerPresenceView(APIView):
    """GET /api/manager/presence/ — who is currently clocked in (open session)."""

    permission_classes = [IsManager]

    def get(self, request: Request) -> Response:
        from services.audit import manager_user_scope
        scope = manager_user_scope(request.user)
        open_sessions = (
            ClockSession.objects.filter(
                clock_out__isnull=True, user__in=scope,
            )
            .select_related("user", "site", "mission")
            .order_by("user__username")
        )
        present = [
            {
                "user_id": s.user_id,
                "username": s.user.get_username(),
                "session_type": s.session_type,
                "site_name": s.site.name if s.site else None,
                "clock_in": s.clock_in,
                "clock_in_rounded": s.clock_in_rounded,
            }
            for s in open_sessions
        ]
        return Response({"present": present, "count": len(present)})


class ManagerAbsentView(APIView):
    """GET /api/manager/absent-today/ — employees with approved absence today.

    Useful for the "real-time absent" panel in the manager dashboard.
    """

    permission_classes = [IsManager]

    def get(self, request: Request) -> Response:
        from apps.absences.models import AbsenceRequest
        from services.audit import manager_user_scope
        scope = manager_user_scope(request.user)
        today = timezone.localdate()
        absences = (
            AbsenceRequest.objects.filter(
                status=AbsenceRequest.Status.APPROVED,
                date_start__lte=today, date_end__gte=today,
                user__in=scope,
            )
            .select_related("user")
        )
        absent = [
            {
                "user_id": a.user_id,
                "username": a.user.get_username(),
                "absence_type": a.absence_type,
                "date_start": a.date_start,
                "date_end": a.date_end,
                "half_day_start": a.half_day_start,
                "half_day_end": a.half_day_end,
            }
            for a in absences
        ]
        # Also list employees with no session today and no approved absence.
        present_user_ids = set(
            ClockSession.objects.filter(clock_in__date=today, user__in=scope)
            .values_list("user_id", flat=True)
        )
        absent_user_ids = {a["user_id"] for a in absent}
        silent = list(
            scope.exclude(id__in=present_user_ids | absent_user_ids)
            .exclude(exempt_from_clocking=True)
            .values("id", "username")
        )
        return Response({
            "absent_on_leave": absent,
            "silent": silent,
        })


class UserMonthlyDetailView(APIView):
    """GET /api/manager/report/<user_id>/?month=YYYY-MM — daily breakdown."""

    permission_classes = [IsManager]

    def get(self, request: Request, user_id: int) -> Response:
        from collections import defaultdict
        from datetime import date as date_type, timedelta
        from apps.absences.models import AbsenceRequest
        from apps.users.models import SiteHoliday, UserProfile

        raw = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            year, month = (int(x) for x in raw.split("-"))
            start = date_type(year, month, 1)
        except (ValueError, TypeError):
            return Response({"error": "INVALID_MONTH"}, status=status.HTTP_400_BAD_REQUEST)
        end = date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)
        end_inclusive = end - timedelta(days=1)

        from services.audit import manager_user_scope
        scope = manager_user_scope(request.user)
        try:
            user = scope.get(pk=user_id)
        except UserProfile.DoesNotExist:
            return Response({"error": "USER_NOT_FOUND_OR_OUT_OF_SCOPE"}, status=status.HTTP_404_NOT_FOUND)

        # Élargir d'un jour de chaque côté pour capturer les sessions de nuit
        # qui débordent sur les bornes (23:30 du dernier jour, 01:00 le 1er).
        sessions = (
            ClockSession.objects.filter(
                user=user,
                clock_in__date__gte=start - timedelta(days=1),
                clock_in__date__lte=end_inclusive,
            )
            .select_related("site", "mission")
            .order_by("clock_in")
        )
        by_day = defaultdict(list)
        for s in sessions:
            key = s.clock_in.date().isoformat()
            # Affichage : la session apparaît sur le jour de son clock_in
            # (un pointage 23:30→01:00 reste affiché sur le jour du clock_in)
            if start <= s.clock_in.date() <= end_inclusive:
                by_day[key].append(ClockSessionSerializer(s).data)

        # Approved absences overlapping this month.
        absences = AbsenceRequest.objects.filter(
            user=user, status=AbsenceRequest.Status.APPROVED,
            date_start__lte=end_inclusive, date_end__gte=start,
        )
        absence_by_day = {}
        for a in absences:
            d = max(a.date_start, start)
            last = min(a.date_end, end_inclusive)
            while d <= last:
                absence_by_day[d.isoformat()] = {
                    "type": a.absence_type,
                    "half_day_start": a.half_day_start and d == a.date_start,
                    "half_day_end": a.half_day_end and d == a.date_end,
                }
                d += timedelta(days=1)

        # Holidays for the user's home site (if any).
        holidays = {}
        if user.home_site_id:
            for h in SiteHoliday.objects.filter(
                site_id=user.home_site_id,
                date__gte=start, date__lte=end_inclusive,
            ):
                holidays[h.date.isoformat()] = h.name

        from services.missions_travel import daily_travel_compensable_minutes
        from services.sessions import worked_minutes_on_day

        days = []
        cur = start
        while cur <= end_inclusive:
            key = cur.isoformat()
            day_sessions = by_day.get(key, [])
            # Calcul fiable même pour les sessions traversant minuit,
            # avec déduction auto de pause (affichage cohérent).
            clocked_min = worked_minutes_on_day(user, cur, apply_policy=True)
            travel_min = daily_travel_compensable_minutes(user, cur)
            worked_min = clocked_min + travel_min
            days.append({
                "date": key,
                "weekday": cur.strftime("%A"),
                "sessions": day_sessions,
                "worked_minutes": worked_min,
                "clocked_minutes": clocked_min,
                "travel_compensable_minutes": travel_min,
                "absence": absence_by_day.get(key),
                "holiday": holidays.get(key),
            })
            cur += timedelta(days=1)

        total_min = sum(d["worked_minutes"] for d in days)
        return Response({
            "user_id": user.id,
            "username": user.get_username(),
            "month": raw,
            "weekly_target_hours": float(user.weekly_target_hours),
            "overtime_balance_hours": float(user.overtime_balance),
            "vacation_remaining": float(user.vacation_quota - user.vacation_used),
            "total_worked_minutes": total_min,
            "total_worked_hours": round(total_min / 60, 2),
            "days": days,
        })


class ManagerTeamCalendarView(APIView):
    """GET /api/manager/team-calendar/?start=YYYY-MM-DD&end=YYYY-MM-DD

    Retourne, pour la plage donnée :
      { absences: [{user_id, username, date_start, date_end,
                    half_day_start, half_day_end, status, absence_type}],
        missions: [{user_id, username, mission_type, date_start, date_end,
                    location_name, status}] }
    Pas encore de scoping par site (cf. étape 9).
    """

    permission_classes = [IsManager]

    def get(self, request: Request) -> Response:
        from datetime import date as date_type
        from apps.absences.models import AbsenceRequest
        from apps.missions.models import Mission
        try:
            start = date_type.fromisoformat(request.query_params.get("start", ""))
            end = date_type.fromisoformat(request.query_params.get("end", ""))
        except ValueError:
            return Response({"error": "INVALID_RANGE"}, status=status.HTTP_400_BAD_REQUEST)

        from services.audit import manager_user_scope
        scope = manager_user_scope(request.user)
        absences = (
            AbsenceRequest.objects
            .filter(date_start__lte=end, date_end__gte=start, user__in=scope)
            .select_related("user")
            .order_by("date_start")
        )
        missions = (
            Mission.objects
            .filter(date_start__lte=end, date_end__gte=start, user__in=scope)
            .select_related("user")
            .order_by("date_start")
        )
        return Response({
            "start": start.isoformat(),
            "end": end.isoformat(),
            "absences": [
                {
                    "id": a.id,
                    "user_id": a.user_id,
                    "username": a.user.get_username(),
                    "absence_type": a.absence_type,
                    "date_start": a.date_start,
                    "date_end": a.date_end,
                    "half_day_start": a.half_day_start,
                    "half_day_end": a.half_day_end,
                    "status": a.status,
                }
                for a in absences
            ],
            "missions": [
                {
                    "id": m.id,
                    "user_id": m.user_id,
                    "username": m.user.get_username(),
                    "mission_type": m.mission_type,
                    "date_start": m.date_start,
                    "date_end": m.date_end,
                    "location_name": m.location_name,
                    "status": m.status,
                }
                for m in missions
            ],
        })


class ManagerTeamView(APIView):
    """GET /api/manager/team/ — vue d'équipe : 1 ligne par employé.

    Retourne pour chaque user actif :
      - statut présence du jour (present / absent_on_leave / silent)
      - heures travaillées cette semaine (du lundi au dimanche)
      - solde heures sup, congés restants
      - nombre d'alertes non résolues le concernant
      - nombre de demandes en attente (missions + absences)

    Pas encore de scoping par site (cf. étape 9).
    """

    permission_classes = [IsManager]

    def get(self, request: Request) -> Response:
        from datetime import timedelta
        from apps.absences.models import AbsenceRequest
        from apps.clocking.models import Alert
        from apps.missions.models import Mission
        from services.audit import manager_user_scope
        scope = manager_user_scope(request.user)
        today = timezone.localdate()
        # Lundi = ISO weekday 1
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        users = scope.order_by("username")
        # Préfetch agrégé pour limiter les requêtes.
        present_user_ids = set(
            ClockSession.objects.filter(clock_in__date=today, clock_out__isnull=True)
            .values_list("user_id", flat=True)
        )
        absent_today_ids = set(
            AbsenceRequest.objects.filter(
                status=AbsenceRequest.Status.APPROVED,
                date_start__lte=today, date_end__gte=today,
            ).values_list("user_id", flat=True)
        )

        # Optim : 3 requêtes agrégées au lieu de 3×N (où N = nb d'employés).
        from django.db.models import Count, Q
        user_ids = list(users.values_list("id", flat=True))
        pending_missions_by_user = dict(
            Mission.objects
            .filter(user_id__in=user_ids, status=Mission.Status.PENDING)
            .values("user_id").annotate(n=Count("id"))
            .values_list("user_id", "n")
        )
        pending_absences_by_user = dict(
            AbsenceRequest.objects
            .filter(user_id__in=user_ids, status=AbsenceRequest.Status.PENDING)
            .values("user_id").annotate(n=Count("id"))
            .values_list("user_id", "n")
        )
        alerts_by_user = dict(
            Alert.objects
            .filter(user_id__in=user_ids, resolved_at__isnull=True)
            .values("user_id").annotate(n=Count("id"))
            .values_list("user_id", "n")
        )
        # Sessions de la semaine groupées par (user, jour) — 1 requête.
        # Groupement par jour pour appliquer la déduction de pause PAR JOUR
        # (le seuil break_trigger_minutes est journalier).
        from collections import defaultdict
        from services.sessions import apply_break_deduction, merged_worked_minutes
        from apps.users.models import WorkTimePolicy
        policy = WorkTimePolicy.load()
        sessions_by_user_day = defaultdict(lambda: defaultdict(list))
        for s in ClockSession.objects.filter(
            user_id__in=user_ids,
            clock_in__date__gte=week_start,
            clock_in__date__lte=week_end,
            clock_out_rounded__isnull=False,
        ):
            sessions_by_user_day[s.user_id][s.clock_in.date()].append(s)

        rows = []
        for u in users:
            worked_min = 0
            for day_sessions in sessions_by_user_day.get(u.id, {}).values():
                day_min = merged_worked_minutes(day_sessions)
                worked_min += apply_break_deduction(day_min, policy=policy)
            pending_missions = pending_missions_by_user.get(u.id, 0)
            pending_absences = pending_absences_by_user.get(u.id, 0)
            unresolved_alerts = alerts_by_user.get(u.id, 0)
            if u.id in present_user_ids:
                today_status = "present"
            elif u.id in absent_today_ids:
                today_status = "absent_on_leave"
            else:
                today_status = "silent"
            rows.append({
                "user_id": u.id,
                "username": u.get_username(),
                "is_manager": u.is_manager,
                "is_superuser": u.is_superuser,
                "exempt_from_clocking": getattr(u, 'exempt_from_clocking', False),
                "home_site_id": u.home_site_id,
                "home_site_name": u.home_site.name if u.home_site_id else None,
                "today_status": today_status,
                "week_worked_minutes": worked_min,
                "week_target_minutes": int(u.weekly_target_hours * 60),
                "overtime_balance_hours": float(u.overtime_balance),
                "vacation_remaining": float(u.vacation_quota - u.vacation_used),
                "pending_missions": pending_missions,
                "pending_absences": pending_absences,
                "unresolved_alerts": unresolved_alerts,
            })
        return Response({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "rows": rows,
        })


class MonthlyReportView(APIView):
    """GET /api/manager/report/?month=YYYY-MM[&format=csv|pdf] — reporting."""

    permission_classes = [IsManager]

    def get(self, request: Request) -> Response:
        from datetime import date as date_type
        from apps.users.models import UserProfile
        from services.reporting import build_monthly_rows, rows_to_csv, rows_to_pdf

        raw = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            year, month = (int(x) for x in raw.split("-"))
            start = date_type(year, month, 1)
        except (ValueError, TypeError):
            return Response(
                {"error": "INVALID_MONTH", "expected": "YYYY-MM"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if month == 12:
            end = date_type(year + 1, 1, 1)
        else:
            end = date_type(year, month + 1, 1)
        from datetime import timedelta
        end_inclusive = end - timedelta(days=1)

        from services.audit import manager_user_scope
        from apps.users.models import UserProfile
        # Périmètre courant : utilisateurs actifs visibles par l'acteur.
        active_ids = set(
            manager_user_scope(request.user).values_list("pk", flat=True),
        )
        # LPD Art. 32 al. 2 + OLT 1 Art. 73 : les comptes anonymisés
        # (`deleted_N`, is_active=False) restent comptabilisables.
        # On les inclut dans le rapport *uniquement* s'ils ont au moins
        # une session sur la période, pour ne pas polluer l'affichage.
        actor = request.user
        anon_qs = UserProfile.objects.filter(
            is_active=False,
            username__regex=r"^deleted_\d+$",
            sessions__clock_in__date__gte=start,
            sessions__clock_in__date__lte=end_inclusive,
        )
        if not actor.is_superuser:
            anon_qs = anon_qs.exclude(is_superuser=True)
            if actor.home_site_id:
                anon_qs = anon_qs.filter(home_site_id=actor.home_site_id)
        anon_ids = set(anon_qs.values_list("pk", flat=True))
        users = (
            UserProfile.objects.filter(pk__in=active_ids | anon_ids)
            .order_by("username")
        )
        rows = build_monthly_rows(users, start, end_inclusive)

        # `format` is reserved by DRF content negotiation, so use `download`.
        fmt = request.query_params.get("download")
        if fmt == "csv":
            from django.http import HttpResponse
            data = rows_to_csv(rows)
            resp = HttpResponse(data, content_type="text/csv; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="report-{raw}.csv"'
            return resp
        if fmt == "pdf":
            from django.http import HttpResponse
            data = rows_to_pdf(rows, start, end_inclusive)
            resp = HttpResponse(data, content_type="application/pdf")
            resp["Content-Disposition"] = f'attachment; filename="report-{raw}.pdf"'
            return resp

        return Response({"month": raw, "rows": rows})


class ManagerAlertsView(APIView):
    """GET /api/manager/alerts/ — unresolved alerts (forgotten + pending justif)."""

    permission_classes = [IsManager]

    def get(self, request: Request) -> Response:
        from apps.clocking.models import Alert
        from services.audit import manager_user_scope
        scope = manager_user_scope(request.user)
        alerts = (
            Alert.objects.filter(resolved_at__isnull=True, user__in=scope)
            .select_related("user", "session")
            .order_by("-created_at")
        )
        pending_justif = (
            ClockSession.objects.filter(
                justification__gt="",
                justification_approved__isnull=True,
                user__in=scope,
            )
            .select_related("user")
            .order_by("-clock_in")
        )
        return Response({
            "alerts": [
                {
                    "id": a.id,
                    "kind": a.kind,
                    "user_id": a.user_id,
                    "username": a.user.get_username(),
                    "session_id": a.session_id,
                    "session_date": a.session.clock_in.date().isoformat() if a.session else None,
                    "message": a.message,
                    "created_at": a.created_at,
                }
                for a in alerts
            ],
            "pending_justifications": [
                {
                    "session_id": s.id,
                    "user_id": s.user_id,
                    "username": s.user.get_username(),
                    "session_date": s.clock_in.date().isoformat(),
                    "clock_in": s.clock_in,
                    "clock_out": s.clock_out,
                    "justification": s.justification,
                }
                for s in pending_justif
            ],
        })


class RegularizeSessionView(APIView):
    """PATCH /api/clock/{id}/regularize/ — manager closes a forgotten session."""

    permission_classes = [IsManager]

    def patch(self, request: Request, pk: int) -> Response:
        from services.audit import can_manager_act_on
        session = generics.get_object_or_404(ClockSession, pk=pk)
        if not can_manager_act_on(request.user, session.user_id):
            return Response(
                {"error": "FORBIDDEN_SELF_OR_OUT_OF_SCOPE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if session.clock_out is not None:
            return Response(
                {"error": "SESSION_ALREADY_CLOSED"},
                status=status.HTTP_409_CONFLICT,
            )
        # Manager supplies clock_out (ISO datetime) or we default to clock_in + 8h.
        from datetime import timedelta
        from django.utils.dateparse import parse_datetime
        raw = request.data.get("clock_out")
        clock_out = parse_datetime(raw) if raw else session.clock_in + timedelta(hours=8)
        if clock_out is None:
            return Response(
                {"error": "INVALID_CLOCK_OUT"}, status=status.HTTP_400_BAD_REQUEST,
            )
        session.clock_out = clock_out
        session.clock_out_rounded = clock_out
        session.is_forgotten = True
        session.save()
        # Resolve the related alert if any.
        from apps.clocking.models import Alert
        Alert.objects.filter(
            session=session, kind=Alert.Kind.FORGOTTEN_CLOCKOUT, resolved_at__isnull=True,
        ).update(resolved_at=timezone.now())
        return Response(ClockSessionSerializer(session).data)


# ── Helper: email managers when a justification is submitted ─────────────────

def _notify_managers_justification(session: ClockSession, actor) -> None:
    """Email active managers when a justification is submitted on a session."""
    from django.conf import settings
    from django.core.mail import send_mail
    from apps.users.models import UserProfile

    employee = session.user
    date_str = session.clock_in.strftime("%d/%m/%Y")

    mgr = getattr(employee, "manager", None)
    if mgr and mgr.email:
        recipients = [mgr.email]
    else:
        recipients = list(
            UserProfile.objects.filter(is_manager=True, is_active=True)
            .exclude(email="")
            .values_list("email", flat=True)[:20]
        )
    if recipients:
        send_mail(
            subject=f"[QR-TIME] Justification à valider — {employee.get_username()}",
            message=(
                f"{employee.get_username()} a soumis une justification pour "
                f"la session du {date_str} :\n\n"
                f"« {session.justification} »\n\n"
                f"Connectez-vous à QR-TIME pour valider ou refuser."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=True,
        )
