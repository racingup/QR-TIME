"""Custom DRF permissions."""
from rest_framework.permissions import BasePermission


class IsManager(BasePermission):
    """Only users with is_manager=True (or is_superuser) may pass."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_manager or user.is_superuser)
        )


class IsSuperUser(BasePermission):
    """Only superusers may pass (the "big manager")."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class CanManageMissions(BasePermission):
    """Manager régulier OU mission manager OU superuser.

    Utilisé pour les endpoints d'approbation / rejet / gestion des missions.
    - manager régulier : approuve les missions de son équipe (scope par site)
    - mission manager : approuve transversalement
    - superuser : tout
    """

    def has_permission(self, request, view) -> bool:
        u = request.user
        return bool(
            u and u.is_authenticated
            and (u.is_manager or getattr(u, "is_mission_manager", False) or u.is_superuser)
        )


class IsMissionManager(BasePermission):
    """Mission manager OU superuser (pour les vues transverses missions)."""

    def has_permission(self, request, view) -> bool:
        u = request.user
        return bool(
            u and u.is_authenticated
            and (getattr(u, "is_mission_manager", False) or u.is_superuser)
        )
