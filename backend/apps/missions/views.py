"""Mission endpoints."""
from __future__ import annotations

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.missions.models import Mission
from apps.missions.serializers import MissionDecisionSerializer, MissionSerializer
from apps.users.permissions import CanManageMissions, IsManager, IsMissionManager
from services.qr import generate_png_base64


# ── Helpers ──────────────────────────────────────────────────────────


def _is_mission_admin(user) -> bool:
    """True si l'utilisateur peut gérer les missions transversalement
    (mission_manager, manager régulier, ou superuser)."""
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_manager
            or getattr(user, "is_mission_manager", False)
            or user.is_superuser
        )
    )


def _can_act_on_mission(actor, mission) -> bool:
    """Vérifie qu'un acteur peut agir (approve / reject / update) sur la mission.

    Règles cumulées :
      1. Doit avoir un rôle de gestion missions (manager / mission_mgr / superuser)
      2. Hiérarchie : non-superuser ne touche pas la mission d'un superuser
      3. **Télétravail (REMOTE) = manager régulier ou admin uniquement**.
         Un mission_manager *pur* (sans is_manager) NE PEUT PAS toucher un REMOTE.
         Le télétravail relève de l'équipe locale, pas du dispatch transverse.
    """
    if not _is_mission_admin(actor):
        return False
    target = mission.user
    if target.is_superuser and not actor.is_superuser:
        return False
    if mission.mission_type == Mission.Type.REMOTE:
        if not (actor.is_manager or actor.is_superuser):
            return False
    return True


# ── Views ────────────────────────────────────────────────────────────


class MissionUpdateView(APIView):
    """PATCH /api/missions/{id}/ — édition d'une mission.

    - L'employé propriétaire édite tant que c'est PENDING (workflow "ma demande").
    - Manager / mission manager / superuser peuvent éditer même APPROVED
      (Option 3B retenue : permet de corriger lieu/dates/numéro après-coup).
    """

    permission_classes = [IsAuthenticated]
    EMPLOYEE_FIELDS = {
        "mission_type", "date_start", "date_end",
        "location_name", "location_lat", "location_lon",
        "gps_radius_meters", "user_comment",
    }
    MANAGER_EXTRA_FIELDS = {"mission_number", "manager_comment"}

    def patch(self, request, pk: int):
        mission = generics.get_object_or_404(Mission, pk=pk)
        user = request.user
        is_admin = _is_mission_admin(user)
        owns_mission = mission.user_id == user.id

        # Cas 1 : propriétaire qui édite sa demande PENDING.
        # (Manager/mission_mgr non-superuser tombent ici sur LEUR propre demande
        #  — ils ne peuvent pas utiliser leurs privilèges admin sur eux-mêmes.)
        if owns_mission and not user.is_superuser:
            if mission.status != Mission.Status.PENDING:
                return Response(
                    {"error": "MISSION_LOCKED", "status": mission.status},
                    status=status.HTTP_409_CONFLICT,
                )
            allowed = self.EMPLOYEE_FIELDS
        # Cas 2 : superuser sur sa propre mission OU manager/mission_mgr sur autrui.
        elif is_admin:
            if not _can_act_on_mission(user, mission):
                return Response({"error": "OUT_OF_SCOPE_HIERARCHY"}, status=status.HTTP_403_FORBIDDEN)
            allowed = self.EMPLOYEE_FIELDS | self.MANAGER_EXTRA_FIELDS
        else:
            return Response({"error": "FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN)

        for key, value in request.data.items():
            if key not in allowed:
                continue
            setattr(mission, key, value)
        mission.save()
        return Response(MissionSerializer(mission).data)


class MissionCreateView(generics.CreateAPIView):
    """POST /api/missions/ — soumission d'une mission.

    Comportements :
      - Employé : crée une demande PENDING pour lui-même.
      - Manager / mission manager / superuser : peut spécifier `user_id`
        pour cibler un autre collaborateur. Si `auto_approve=true`, la
        mission est créée APPROVED + qr_token généré + approved_by=self.
    """

    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        from rest_framework.exceptions import NotFound, PermissionDenied
        actor = self.request.user
        target_user_id = self.request.data.get("user_id")
        auto_approve = bool(self.request.data.get("auto_approve"))
        mission_type = serializer.validated_data.get("mission_type") or self.request.data.get("mission_type")

        if target_user_id and int(target_user_id) != actor.id:
            if not _is_mission_admin(actor):
                raise PermissionDenied("Only managers / mission managers can assign missions to others.")
            from apps.users.models import UserProfile
            try:
                target = UserProfile.objects.get(pk=target_user_id, is_active=True)
            except UserProfile.DoesNotExist:
                raise NotFound("Target user not found.")
            if target.is_superuser and not actor.is_superuser:
                raise PermissionDenied("Cannot assign a mission to a superuser.")
            # Mission manager *pur* (pas manager régulier, pas superuser) ne peut
            # PAS attribuer de télétravail. REMOTE = manager / admin uniquement.
            if (
                mission_type == Mission.Type.REMOTE
                and not actor.is_manager
                and not actor.is_superuser
            ):
                raise PermissionDenied(
                    "Le télétravail (REMOTE) est géré par le manager ou l'admin, "
                    "pas par le mission manager."
                )
        else:
            target = actor
            # Self-assignment via auto_approve: only superuser can self-approve.
            if auto_approve and not actor.is_superuser:
                auto_approve = False

        mission = serializer.save(user=target, status=Mission.Status.PENDING)
        if auto_approve:
            mission.approve(actor, comment=self.request.data.get("manager_comment", ""))
            # Re-serialize so the response reflects approved + qr_token.
            serializer.instance = mission


class MyMissionsView(generics.ListAPIView):
    """GET /api/missions/my/ — missions for the authenticated user."""

    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Mission.objects.filter(user=self.request.user)


class PendingMissionsView(generics.ListAPIView):
    """GET /api/missions/pending/ — manager-facing pending missions (scoped)."""

    serializer_class = MissionSerializer
    permission_classes = [IsManager]

    def get_queryset(self):
        from services.audit import manager_user_scope
        return Mission.objects.filter(
            status=Mission.Status.PENDING,
            user__in=manager_user_scope(self.request.user),
        )


class AllMissionsView(generics.ListAPIView):
    """GET /api/missions/all/?status=&user_id=&from=&to=&q=

    Liste transverse — accessible à tout détenteur d'un rôle de gestion missions.
    Filtres :
      - status   : PENDING|APPROVED|REJECTED
      - user_id  : restreint à un collaborateur
      - from/to  : dates (chevauchement avec la plage de la mission)
      - q        : recherche libre dans location_name + mission_number
    Hiérarchie : exclut les missions des superusers si l'acteur n'est pas superuser.
    """

    serializer_class = MissionSerializer
    permission_classes = [CanManageMissions]
    pagination_class = None

    def get_queryset(self):
        from datetime import date as date_type
        qs = Mission.objects.select_related("user", "approved_by").order_by("-created_at")
        actor = self.request.user
        if not actor.is_superuser:
            qs = qs.exclude(user__is_superuser=True)
        # Manager régulier (pas mission manager) : scope par site.
        if (
            actor.is_manager
            and not getattr(actor, "is_mission_manager", False)
            and not actor.is_superuser
        ):
            from services.audit import manager_user_scope
            qs = qs.filter(user__in=manager_user_scope(actor))
        # Mission manager *pur* (pas is_manager, pas superuser) : pas de REMOTE.
        if (
            getattr(actor, "is_mission_manager", False)
            and not actor.is_manager
            and not actor.is_superuser
        ):
            qs = qs.exclude(mission_type=Mission.Type.REMOTE)
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("user_id"):
            qs = qs.filter(user_id=params["user_id"])
        if params.get("from"):
            try:
                qs = qs.filter(date_end__gte=date_type.fromisoformat(params["from"]))
            except ValueError:
                pass
        if params.get("to"):
            try:
                qs = qs.filter(date_start__lte=date_type.fromisoformat(params["to"]))
            except ValueError:
                pass
        if params.get("q"):
            from django.db.models import Q
            term = params["q"]
            qs = qs.filter(Q(location_name__icontains=term) | Q(mission_number__icontains=term))
        return qs


class MissionApproveView(APIView):
    """PATCH /api/missions/{id}/approve/ — approbation (manager / mission mgr / admin)."""

    permission_classes = [CanManageMissions]

    def patch(self, request, pk: int):
        mission = generics.get_object_or_404(Mission, pk=pk)
        if not _can_act_on_mission(request.user, mission):
            return Response({"error": "OUT_OF_SCOPE_HIERARCHY"}, status=status.HTTP_403_FORBIDDEN)
        if mission.user_id == request.user.id and not request.user.is_superuser:
            return Response(
                {"error": "SELF_APPROVAL_FORBIDDEN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = MissionDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        if "gps_radius_meters" in data:
            mission.gps_radius_meters = data["gps_radius_meters"]
        if data.get("location_lat") is not None:
            mission.location_lat = data["location_lat"]
        if data.get("location_lon") is not None:
            mission.location_lon = data["location_lon"]
        mission.approve(request.user, comment=data.get("manager_comment", ""))
        return Response(MissionSerializer(mission).data, status=status.HTTP_200_OK)


class MissionRejectView(APIView):
    """PATCH /api/missions/{id}/reject/ — refus (manager / mission mgr / admin)."""

    permission_classes = [CanManageMissions]

    def patch(self, request, pk: int):
        mission = generics.get_object_or_404(Mission, pk=pk)
        if not _can_act_on_mission(request.user, mission):
            return Response({"error": "OUT_OF_SCOPE_HIERARCHY"}, status=status.HTTP_403_FORBIDDEN)
        # Anti-self : pas d'auto-décision (sauf superuser).
        if mission.user_id == request.user.id and not request.user.is_superuser:
            return Response(
                {"error": "SELF_DECISION_FORBIDDEN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = MissionDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        mission.reject(request.user, comment=payload.validated_data.get("manager_comment", ""))
        return Response(MissionSerializer(mission).data, status=status.HTTP_200_OK)


class MissionQRView(APIView):
    """GET /api/missions/{id}/qr/ — QR mission en base64 PNG."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        mission = generics.get_object_or_404(Mission, pk=pk)
        # Owner ou tout rôle de gestion missions.
        if mission.user_id != request.user.id and not _is_mission_admin(request.user):
            return Response({"error": "FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN)
        if not mission.qr_token:
            return Response(
                {"error": "MISSION_NOT_APPROVED"}, status=status.HTTP_409_CONFLICT,
            )
        return Response({
            "mission_id": mission.id,
            "qr_token": mission.qr_token,
            "qr_png_base64": generate_png_base64(mission.qr_token),
        })
