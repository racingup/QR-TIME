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
    """GET /api/absences/my/ — absences for the authenticated user.

    Optional query params `start=YYYY-MM-DD&end=YYYY-MM-DD` filter by overlap
    with the given range (for the calendar view).
    """

    serializer_class = AbsenceRequestSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # calendar view wants the full list, not paginated

    def get_queryset(self):
        from datetime import date as date_type
        qs = AbsenceRequest.objects.filter(user=self.request.user)
        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")
        if start and end:
            try:
                start_d = date_type.fromisoformat(start)
                end_d = date_type.fromisoformat(end)
                qs = qs.filter(date_start__lte=end_d, date_end__gte=start_d)
            except ValueError:
                pass
        return qs


class PendingAbsencesView(generics.ListAPIView):
    """GET /api/absences/pending/ — manager-facing pending absences (scoped)."""

    serializer_class = AbsenceRequestSerializer
    permission_classes = [IsManager]

    def get_queryset(self):
        from services.audit import manager_user_scope
        return AbsenceRequest.objects.filter(
            status=AbsenceRequest.Status.PENDING,
            user__in=manager_user_scope(self.request.user),
        )


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


class AbsenceRejectView(APIView):
    """PATCH /api/absences/{id}/reject/ — manager rejects with optional motif."""

    permission_classes = [IsManager]

    def patch(self, request, pk: int):
        absence = generics.get_object_or_404(AbsenceRequest, pk=pk)
        # Anti-self : pas d'auto-décision (sauf superuser).
        if absence.user_id == request.user.id and not request.user.is_superuser:
            return Response(
                {"error": "SELF_DECISION_FORBIDDEN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = AbsenceDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        absence.status = AbsenceRequest.Status.REJECTED
        absence.approved_by = request.user
        absence.manager_comment = payload.validated_data.get("manager_comment", "")
        absence.save()
        return Response(AbsenceRequestSerializer(absence).data)


class AbsenceUpdateView(APIView):
    """PATCH /api/absences/{id}/ — manager / superuser edit any field.

    Anti-self : un manager ne peut pas éditer sa propre absence via cette
    route (sauf superuser). L'employé propriétaire édite via le workflow
    standard de soumission (champs limités) — pas via cette vue privilégiée.
    """

    permission_classes = [IsManager]

    def patch(self, request, pk: int):
        from services.audit import can_manager_act_on
        absence = generics.get_object_or_404(AbsenceRequest, pk=pk)
        if not can_manager_act_on(request.user, absence.user_id):
            return Response(
                {"error": "FORBIDDEN_SELF_OR_OUT_OF_SCOPE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        ser = AbsenceRequestSerializer(absence, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)
