"""Format d'erreur API standardisé.

Standard appliqué partout :
{
    "error": "ERROR_CODE",     # SCREAMING_SNAKE
    "detail": "Message lisible utilisateur (FR)",
    "context": {...}           # facultatif, dépend du contexte
}

Utilisation :
    return api_error("OVERLAPPING_SESSION", "Un pointage existe déjà…", overlapping_id=42)
    return api_error("FORBIDDEN", "...", status=403)
"""
from __future__ import annotations

from typing import Any, Optional

from rest_framework import status as drf_status
from rest_framework.response import Response


def api_error(
    code: str,
    detail: str,
    *,
    status: int = drf_status.HTTP_400_BAD_REQUEST,
    **context: Any,
) -> Response:
    """Construit une réponse d'erreur cohérente."""
    payload: dict[str, Any] = {"error": code, "detail": detail}
    if context:
        payload["context"] = context
    return Response(payload, status=status)
