"""Mission endpoints."""
from __future__ import annotations

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.missions.models import Mission
from apps.missions.serializers import MissionDecisionSerializer, MissionSerializer
from apps.users.permissions import IsManager
from services.qr import generate_png_base64


class MissionCreateView(generics.CreateAPIView):
    """POST /api/missions/ — employee submits a mission request."""

    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status=Mission.Status.PENDING)


class MissionApproveView(APIView):
    """PATCH /api/missions/{id}/approve/ — manager approves; qr_token generated."""

    permission_classes = [IsManager]

    def patch(self, request, pk: int):
        mission = generics.get_object_or_404(Mission, pk=pk)
        payload = MissionDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        mission.approve(request.user, comment=payload.validated_data.get("manager_comment", ""))
        return Response(MissionSerializer(mission).data, status=status.HTTP_200_OK)


class MissionRejectView(APIView):
    """PATCH /api/missions/{id}/reject/ — manager rejects with optional comment."""

    permission_classes = [IsManager]

    def patch(self, request, pk: int):
        mission = generics.get_object_or_404(Mission, pk=pk)
        payload = MissionDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        mission.reject(request.user, comment=payload.validated_data.get("manager_comment", ""))
        return Response(MissionSerializer(mission).data, status=status.HTTP_200_OK)


class MissionQRView(APIView):
    """GET /api/missions/{id}/qr/ — returns the mission QR as base64 PNG."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        mission = generics.get_object_or_404(Mission, pk=pk)
        # Owner or manager only.
        if mission.user_id != request.user.id and not request.user.is_manager:
            return Response(
                {"error": "FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN,
            )
        if not mission.qr_token:
            return Response(
                {"error": "MISSION_NOT_APPROVED"}, status=status.HTTP_409_CONFLICT,
            )
        return Response({
            "mission_id": mission.id,
            "qr_token": mission.qr_token,
            "qr_png_base64": generate_png_base64(mission.qr_token),
        })
