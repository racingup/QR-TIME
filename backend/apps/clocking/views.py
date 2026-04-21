"""Clocking endpoints (scan + history)."""
from __future__ import annotations

from datetime import date as date_type

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clocking.models import ClockSession, FixedTimeSlot
from apps.clocking.serializers import ClockSessionSerializer, ScanRequestSerializer
from apps.missions.models import Mission
from apps.users.models import Site, ToleranceConfig
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

            # Final clock_out of the day → update overtime balance.
            still_open = ClockSession.objects.filter(
                user=user, clock_out__isnull=True,
            ).exists()
            if not still_open:
                delta = compute_overtime(user, today)
                user.overtime_balance = (user.overtime_balance or 0) + delta
                user.save(update_fields=["overtime_balance"])

        body = ClockSessionSerializer(session).data
        body["action"] = action
        return Response(body, status=status.HTTP_200_OK)


class TodaySessionsView(APIView):
    """GET /api/clock/today/ — sessions for the authenticated user, today."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        today = timezone.localdate(timezone.now())
        sessions = ClockSession.objects.filter(
            user=request.user, clock_in__date=today,
        ).order_by("clock_in")
        return Response(ClockSessionSerializer(sessions, many=True).data)
