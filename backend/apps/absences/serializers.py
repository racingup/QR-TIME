"""Serializers for the absences app."""
from __future__ import annotations

from rest_framework import serializers

from apps.absences.models import AbsenceRequest


class AbsenceRequestSerializer(serializers.ModelSerializer):
    days_count = serializers.FloatField(read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    def validate(self, attrs):
        ds = attrs.get("date_start") or getattr(self.instance, "date_start", None)
        de = attrs.get("date_end") or getattr(self.instance, "date_end", None)
        hs = attrs.get("half_day_start", False)
        he = attrs.get("half_day_end", False)
        if ds and de and de < ds:
            raise serializers.ValidationError({"date_end": "doit être ≥ date_start"})
        if ds and de and ds == de and hs and he:
            raise serializers.ValidationError({
                "half_day_end": "Sur un seul jour : choisir matin OU après-midi, pas les deux.",
            })
        return attrs

    class Meta:
        model = AbsenceRequest
        fields = [
            "id", "user", "username", "absence_type",
            "date_start", "date_end",
            "half_day_start", "half_day_end", "days_count",
            "status", "approved_by",
            "user_comment", "manager_comment",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "user", "username", "status", "approved_by",
            "manager_comment", "created_at", "updated_at", "days_count",
        ]


class AbsenceDecisionSerializer(serializers.Serializer):
    manager_comment = serializers.CharField(required=False, allow_blank=True, default="")
