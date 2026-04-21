"""Serializers for the clocking app."""
from __future__ import annotations

from rest_framework import serializers

from apps.clocking.models import ClockSession, FixedTimeSlot


class ScanRequestSerializer(serializers.Serializer):
    """Payload for POST /api/clock/scan/."""

    qr_token = serializers.CharField(max_length=64)
    gps_lat = serializers.FloatField(required=False, allow_null=True)
    gps_lon = serializers.FloatField(required=False, allow_null=True)
    justification = serializers.CharField(required=False, allow_blank=True, default="")


class ClockSessionSerializer(serializers.ModelSerializer):
    duration_minutes = serializers.IntegerField(read_only=True)
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = ClockSession
        fields = [
            "id", "user", "session_type", "site", "mission",
            "clock_in", "clock_out", "clock_in_rounded", "clock_out_rounded",
            "gps_lat_in", "gps_lon_in", "gps_lat_out", "gps_lon_out",
            "justification", "justification_approved", "is_forgotten",
            "duration_minutes", "is_open",
        ]
        read_only_fields = fields


class FixedTimeSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = FixedTimeSlot
        fields = ["id", "name", "start_time", "end_time", "is_active"]
