"""Absence endpoints."""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.mail import send_mail
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.absences.models import AbsenceRequest
from apps.absences.serializers import AbsenceDecisionSerializer, AbsenceRequestSerializer
from apps.users.models import UserProfile
from apps.users.permissions import IsManager


def _notify_managers(subject: str, message: str, employee: UserProfile) -> None:
    """Send an email to the employee's direct manager or all active managers."""
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
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=True)


def _check_overlap(user: UserProfile, date_start, date_end, exclude_pk=None) -> None:
    """Raise ValidationError if an approved absence overlaps the given range."""
    qs = AbsenceRequest.objects.filter(
        user=user,
        status=AbsenceRequest.Status.APPROVED,
        date_start__lte=date_end,
        date_end__gte=date_start,
    )
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    if qs.exists():
        raise ValidationError(
            "Une absence approuvée existe déjà sur cette période. "
            "Veuillez vérifier votre planning ou contacter un manager."
        )


class AbsenceCreateView(generics.CreateAPIView):
    """POST /api/absences/ — employee submits an absence request."""

    serializer_class = AbsenceRequestSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user
        date_start = serializer.validated_data.get("date_start")
        date_end = serializer.validated_data.get("date_end")
        absence_type = serializer.validated_data.get("absence_type")
        half_day_start = serializer.validated_data.get("half_day_start", False)
        half_day_end = serializer.validated_data.get("half_day_end", False)

        # Validation de cohérence basique : date_end >= date_start.
        if date_end < date_start:
            raise ValidationError("La date de fin doit être ≥ à la date de début.")

        # Overlap guard: reject if an approved absence already covers these dates.
        _check_overlap(user, date_start, date_end)

        # Validation du quota pour les CONGÉS uniquement.
        if absence_type == AbsenceRequest.AbsenceType.VACATION:
            # Calculer les jours demandés (logique alignée sur days_count property).
            whole = (date_end - date_start).days + 1
            if date_start == date_end:
                if half_day_start and half_day_end:
                    requested = 0.0
                elif half_day_start or half_day_end:
                    requested = 0.5
                else:
                    requested = float(whole)
            else:
                delta = 0.0
                if half_day_start:
                    delta += 0.5
                if half_day_end:
                    delta += 0.5
                requested = whole - delta

            from services.vacation import recompute_vacation_used
            current_used = recompute_vacation_used(user)
            remaining = Decimal(user.vacation_quota) - current_used
            if Decimal(str(requested)) > remaining:
                raise ValidationError(
                    f"Solde de congés insuffisant : vous demandez {requested:.1f} "
                    f"jour(s), il vous reste {remaining:.1f} jour(s)."
                )

        instance = serializer.save(user=user, status=AbsenceRequest.Status.PENDING)

        # Notify managers by email.
        absence_label = instance.get_absence_type_display()
        _notify_managers(
            subject=f"[QR-TIME] Demande d'absence — {user.get_username()}",
            message=(
                f"{user.get_username()} a soumis une demande de {absence_label} "
                f"du {instance.date_start:%d/%m/%Y} au {instance.date_end:%d/%m/%Y} "
                f"({instance.days_count} jour(s)).\n\n"
                f"Connectez-vous à QR-TIME pour valider ou refuser."
            ),
            employee=user,
        )


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

        # Recompute vacation_used : couvre VACATION approvée, SICK qui
        # chevauche, et toute combinaison (logique GAZNAT centralisée).
        from services.vacation import recompute_vacation_used
        recompute_vacation_used(absence.user)

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
        # On peut passer d'APPROVED → REJECTED ; il faut alors recalculer
        # (vacation_used baisse car cette absence n'est plus comptée).
        was_approved = (absence.status == AbsenceRequest.Status.APPROVED)
        absence.status = AbsenceRequest.Status.REJECTED
        absence.approved_by = request.user
        absence.manager_comment = payload.validated_data.get("manager_comment", "")
        absence.save()
        if was_approved:
            from services.vacation import recompute_vacation_used
            recompute_vacation_used(absence.user)
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
        # Month lock check: managers cannot edit absences in locked months.
        _check_month_lock(request.user, absence.date_start)

        ser = AbsenceRequestSerializer(absence, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        # L'édition peut changer dates, type ou status → recalcul du quota.
        from services.vacation import recompute_vacation_used
        recompute_vacation_used(absence.user)
        return Response(ser.data)


class AbsenceCancelView(APIView):
    """POST /api/absences/{id}/cancel/ — employee cancels their own PENDING request."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            absence = AbsenceRequest.objects.get(pk=pk, user=request.user)
        except AbsenceRequest.DoesNotExist:
            return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if absence.status != AbsenceRequest.Status.PENDING:
            return Response(
                {"error": "NOT_CANCELLABLE", "detail": "Seules les demandes en attente peuvent être annulées."},
                status=status.HTTP_409_CONFLICT,
            )
        # Une demande PENDING n'a jamais incrémenté vacation_used, donc
        # pas de recompute nécessaire ici.
        absence.status = AbsenceRequest.Status.REJECTED
        absence.manager_comment = "Annulé par l'employé."
        absence.save(update_fields=["status", "manager_comment"])
        return Response({"status": "cancelled"})


# ── Helper functions ──────────────────────────────────────────────────────────

def _recredite_vacation_for_sick_overlap(sick_absence: AbsenceRequest) -> None:
    """When a SICK absence is approved, recredits vacation days that overlap.

    GAZNAT rule: if an employee on approved vacation gets sick, the sick days
    should not count against vacation quota.
    """
    overlapping_vacations = AbsenceRequest.objects.filter(
        user=sick_absence.user,
        absence_type=AbsenceRequest.AbsenceType.VACATION,
        status=AbsenceRequest.Status.APPROVED,
        date_start__lte=sick_absence.date_end,
        date_end__gte=sick_absence.date_start,
    )
    overlap_days = sum(v.days_count for v in overlapping_vacations)
    if overlap_days > 0:
        user = sick_absence.user
        user.vacation_used = max(
            Decimal("0"),
            user.vacation_used - Decimal(str(overlap_days)),
        )
        user.save(update_fields=["vacation_used"])


def _check_month_lock(user: UserProfile, obj_date) -> None:
    """Délégation vers `services.month_lock` (point unique de décision)."""
    from services.month_lock import check_month_lock
    check_month_lock(user, obj_date)
