"""Serializers for the absences app."""
from __future__ import annotations

from rest_framework import serializers

from apps.absences.models import AbsenceRequest


class AbsenceRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = AbsenceRequest
        fields = [
            "id", "user", "absence_type",
            "date_start", "date_end",
            "status", "approved_by", "manager_comment",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "user", "status", "approved_by",
            "manager_comment", "created_at", "updated_at",
        ]


class AbsenceDecisionSerializer(serializers.Serializer):
    manager_comment = serializers.CharField(required=False, allow_blank=True, default="")
