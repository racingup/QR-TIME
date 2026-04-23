"""Serializers for the missions app."""
from __future__ import annotations

from rest_framework import serializers

from apps.missions.models import Mission


class MissionSerializer(serializers.ModelSerializer):
    """Read serializer + base for create."""

    username = serializers.CharField(source="user.username", read_only=True)
    clocked_minutes = serializers.SerializerMethodField()
    time_spent_minutes = serializers.SerializerMethodField()
    standard_commute_minutes = serializers.IntegerField(
        source="user.standard_commute_minutes", read_only=True,
    )
    user_has_home_address = serializers.BooleanField(
        source="user.has_home_address", read_only=True,
    )
    # Coordonnées du site de rattachement du user — exposées en lecture
    # seule pour que le frontend centre la carte d'édition de la mission
    # sur le site du collaborateur quand aucune coordonnée mission n'existe.
    user_home_site_latitude = serializers.DecimalField(
        source="user.home_site.latitude", max_digits=9, decimal_places=6,
        read_only=True, allow_null=True,
    )
    user_home_site_longitude = serializers.DecimalField(
        source="user.home_site.longitude", max_digits=9, decimal_places=6,
        read_only=True, allow_null=True,
    )

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
            # Trajet pro Art. 13 al. 3 OLT 1 — figés à l'approbation.
            "travel_minutes_actual", "travel_minutes_compensable",
            "standard_commute_minutes", "user_has_home_address",
            "user_home_site_latitude", "user_home_site_longitude",
            "clocked_minutes", "time_spent_minutes",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "user", "username", "qr_token", "status", "approved_by",
            "manager_comment",
            "travel_minutes_actual", "travel_minutes_compensable",
            "standard_commute_minutes", "user_has_home_address",
            "user_home_site_latitude", "user_home_site_longitude",
            "clocked_minutes", "time_spent_minutes",
            "created_at", "updated_at",
        ]

    def get_clocked_minutes(self, obj) -> int:
        """Somme des durées des ClockSession (sur place) — sans le trajet."""
        total = 0
        for s in obj.sessions.all():
            if s.clock_out_rounded:
                total += s.duration_minutes
        return total

    def get_time_spent_minutes(self, obj) -> int:
        """Temps de mission TOTAL = pointage sur place + (compensable × N jours
        distincts avec sessions). Convention métier : 1 A/R par jour de présence,
        pas une seule fois pour la mission entière. Voir
        `services/missions_travel.mission_total_compensable_minutes`."""
        from services.missions_travel import mission_total_compensable_minutes
        return self.get_clocked_minutes(obj) + mission_total_compensable_minutes(obj)


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
