"""Serializers for the missions app."""
from __future__ import annotations

from rest_framework import serializers

from apps.missions.models import Mission


class MissionSerializer(serializers.ModelSerializer):
    """Read serializer + base for create."""

    class Meta:
        model = Mission
        fields = [
            "id", "user", "mission_type",
            "date_start", "date_end",
            "location_name", "location_lat", "location_lon",
            "gps_radius_meters",
            "qr_token", "status", "approved_by", "manager_comment",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "user", "qr_token", "status", "approved_by",
            "manager_comment", "created_at", "updated_at",
        ]


class MissionDecisionSerializer(serializers.Serializer):
    """Optional manager comment for approve/reject endpoints."""

    manager_comment = serializers.CharField(required=False, allow_blank=True, default="")
