"""Admin/manager-facing endpoints under /api/admin/."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clocking.models import ClockSession
from apps.users.models import Site, SiteQRAudit, ToleranceConfig, UserProfile
from apps.users.permissions import IsManager
from apps.users.serializers import (
    AdminUserSerializer,
    SiteSerializer,
    ToleranceConfigSerializer,
)


class SiteViewSet(viewsets.ModelViewSet):
    """CRUD on Sites — manager only."""

    queryset = Site.objects.all().order_by("name")
    serializer_class = SiteSerializer
    permission_classes = [IsManager]

    @action(detail=True, methods=["get"], url_path="qr")
    def qr(self, request, pk=None):
        """GET /api/admin/sites/{id}/qr/ — site's QR as base64 PNG."""
        from services.qr import generate_png_base64
        site = self.get_object()
        return Response({
            "site_id": site.id,
            "site_name": site.name,
            "qr_token": site.qr_code_token,
            "qr_png_base64": generate_png_base64(site.qr_code_token),
            "token_updated_at": site.token_updated_at,
        })

    @action(detail=True, methods=["post"], url_path="regen-qr")
    def regen_qr(self, request, pk=None):
        """POST /api/admin/sites/{id}/regen-qr/ — rotate the site's QR token."""
        site = self.get_object()
        old_token = site.qr_code_token
        new_token = site.regenerate_token()
        SiteQRAudit.objects.create(
            site=site,
            old_token=old_token,
            new_token=new_token,
            regenerated_by=request.user,
        )
        return Response(
            {
                "site_id": site.id,
                "old_token": old_token,
                "new_token": new_token,
                "token_updated_at": site.token_updated_at,
            },
            status=status.HTTP_200_OK,
        )


class ToleranceConfigView(APIView):
    """GET / PUT /api/admin/tolerance/ — singleton config."""

    permission_classes = [IsManager]

    def get(self, request):
        return Response(ToleranceConfigSerializer(ToleranceConfig.load()).data)

    def put(self, request):
        config = ToleranceConfig.load()
        ser = ToleranceConfigSerializer(config, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class MeSummaryView(APIView):
    """GET /api/me/summary/ — dashboard payload for the authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        sessions_today = ClockSession.objects.filter(
            user=user, clock_in__date=today,
        )
        worked_minutes = sum(
            s.duration_minutes for s in sessions_today if s.clock_out_rounded
        )
        open_session = sessions_today.filter(clock_out__isnull=True).first()
        return Response({
            "username": user.get_username(),
            "is_manager": user.is_manager,
            "is_superuser": user.is_superuser,
            "weekly_target_hours": user.weekly_target_hours,
            "daily_target_hours": user.daily_target_hours,
            "overtime_balance_hours": user.overtime_balance,
            "vacation_quota": user.vacation_quota,
            "vacation_used": user.vacation_used,
            "vacation_remaining": Decimal(user.vacation_quota) - user.vacation_used,
            "today": {
                "worked_minutes": worked_minutes,
                "target_minutes": int(user.daily_target_hours * 60),
                "has_open_session": open_session is not None,
            },
        })


class AdminUserViewSet(viewsets.ModelViewSet):
    """CRUD on UserProfile — manager only."""

    queryset = UserProfile.objects.all().order_by("username")
    serializer_class = AdminUserSerializer
    permission_classes = [IsManager]
