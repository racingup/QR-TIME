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
