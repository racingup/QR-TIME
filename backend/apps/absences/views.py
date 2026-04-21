"""Absence endpoints."""
from __future__ import annotations

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.absences.models import AbsenceRequest
from apps.absences.serializers import AbsenceDecisionSerializer, AbsenceRequestSerializer
from apps.users.permissions import IsManager


class AbsenceCreateView(generics.CreateAPIView):
    """POST /api/absences/ — employee submits an absence request."""

    serializer_class = AbsenceRequestSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status=AbsenceRequest.Status.PENDING)


class MyAbsencesView(generics.ListAPIView):
    """GET /api/absences/my/ — absences for the authenticated user."""

    serializer_class = AbsenceRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return AbsenceRequest.objects.filter(user=self.request.user)


class PendingAbsencesView(generics.ListAPIView):
    """GET /api/absences/pending/ — manager-facing pending absences."""

    serializer_class = AbsenceRequestSerializer
    permission_classes = [IsManager]
    queryset = AbsenceRequest.objects.filter(status=AbsenceRequest.Status.PENDING)


class AbsenceApproveView(APIView):
    """PATCH /api/absences/{id}/approve/ — manager approves."""

    permission_classes = [IsManager]

    def patch(self, request, pk: int):
        absence = generics.get_object_or_404(AbsenceRequest, pk=pk)
        if absence.user_id == request.user.id and not request.user.is_superuser:
            return Response(
                {"error": "SELF_APPROVAL_FORBIDDEN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = AbsenceDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        absence.status = AbsenceRequest.Status.APPROVED
        absence.approved_by = request.user
        absence.manager_comment = payload.validated_data.get("manager_comment", "")
        absence.save()
        return Response(AbsenceRequestSerializer(absence).data, status=status.HTTP_200_OK)
