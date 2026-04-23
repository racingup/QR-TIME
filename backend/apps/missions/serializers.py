"""Serializers for the missions app."""
from __future__ import annotations

from rest_framework import serializers

from apps.missions.models import Mission


class MissionSerializer(serializers.ModelSerializer):
    """Read serializer + base for create."""

    username = serializers.CharField(source="user.username", read_only=True)
    time_spent_minutes = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = [
            "id", "user", "username", "mission_type",
            "date_start", "date_end",
            "location_name", "location_lat", "location_lon",
            "gps_radius_meters",
            "mission_number",
            "qr_token", "status", "approved_by",
            "user_comment", "manager_comment",
            "time_spent_minutes",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "user", "username", "qr_token", "status", "approved_by",
            "manager_comment", "time_spent_minutes",
            "created_at", "updated_at",
        ]

    def get_time_spent_minutes(self, obj):
        """Somme des durées des ClockSession liées à cette mission (clôturées)."""
        total = 0
        for s in obj.sessions.all():
            if s.clock_out_rounded:
                total += s.duration_minutes
        return total


class MissionDecisionSerializer(serializers.Serializer):
    """Manager-side approve/reject payload.

    On approve, the manager may override the employee-requested
    `gps_radius_meters` (or set it for the first time).
    """

    manager_comment = serializers.CharField(required=False, allow_blank=True, default="")
    gps_radius_meters = serializers.IntegerField(required=False, allow_null=True, min_value=10)
    location_lat = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True,
    )
    location_lon = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True,
    )
