"""Serializers for the users app."""
from __future__ import annotations

from rest_framework import serializers

from apps.users.models import (
    CompanySettings,
    Site,
    SiteHoliday,
    ToleranceConfig,
    UserProfile,
)


class SiteHolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteHoliday
        fields = ["id", "site", "date", "name"]
        read_only_fields = ["id"]


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = [
            "id", "name", "qr_code_token",
            "latitude", "longitude", "gps_radius_meters",
            "token_updated_at",
        ]
        read_only_fields = ["id", "qr_code_token", "token_updated_at"]


class ToleranceConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToleranceConfig
        fields = ["tolerance_minutes", "rounding_direction"]


class CompanySettingsSerializer(serializers.ModelSerializer):
    """Sérialisation complète — utilisée par l'endpoint admin (PUT) et par
    l'endpoint authentifié `/api/me/company/` (GET) pour interpoler la
    politique de confidentialité côté frontend."""

    class Meta:
        model = CompanySettings
        fields = [
            "name", "legal_form",
            "address_line", "postal_code", "city", "country",
            "dpo_contact_email", "dpo_contact_phone",
            "privacy_policy_extra",
            "logo_data_url", "primary_color", "secondary_color",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_logo_data_url(self, value: str) -> str:
        if not value:
            return ""
        # Garde-fou : doit ressembler à une data URL d'image, et limite de
        # taille (200 KB pour laisser un peu de marge au-delà des 150 KB
        # cibles, sans permettre d'uploader une photo de 5 MB).
        if not value.startswith("data:image/"):
            raise serializers.ValidationError(
                "Le logo doit être une data URL d'image (data:image/png;base64,…).",
            )
        if len(value) > 200_000:
            raise serializers.ValidationError(
                "Le logo dépasse 200 KB. Réduisez sa taille (256 px max recommandé).",
            )
        return value

    def validate_primary_color(self, value: str) -> str:
        return _validate_hex_color(value, field="primary_color")

    def validate_secondary_color(self, value: str) -> str:
        return _validate_hex_color(value, field="secondary_color")


def _validate_hex_color(value: str, field: str) -> str:
    """Accepte #RGB, #RRGGBB, #RRGGBBAA. Renvoie la valeur normalisée (lower)."""
    import re
    if not value:
        return ""
    v = value.strip().lower()
    if not re.match(r"^#[0-9a-f]{3}(?:[0-9a-f]{3}(?:[0-9a-f]{2})?)?$", v):
        raise serializers.ValidationError(
            f"{field} doit être un code couleur hex (#RGB, #RRGGBB ou #RRGGBBAA).",
        )
    return v


class PublicBrandingSerializer(serializers.ModelSerializer):
    """Sous-ensemble exposé sans authentification (login page).

    Strictement les éléments visuels — pas d'infos sensibles (email DPO,
    adresse, etc.) qui ne doivent pas être indexables sans login.
    """

    class Meta:
        model = CompanySettings
        fields = ["name", "logo_data_url", "primary_color", "secondary_color"]
        read_only_fields = fields


class AdminUserSerializer(serializers.ModelSerializer):
    """Manager-facing user editor."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    # Coordonnées du site de rattachement, exposées en lecture seule pour
    # permettre au frontend de centrer la carte sur le bon endroit lors de
    # la création / l'édition d'une mission attribuée à ce user.
    home_site_latitude = serializers.DecimalField(
        source="home_site.latitude", max_digits=9, decimal_places=6,
        read_only=True, allow_null=True,
    )
    home_site_longitude = serializers.DecimalField(
        source="home_site.longitude", max_digits=9, decimal_places=6,
        read_only=True, allow_null=True,
    )

    class Meta:
        model = UserProfile
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "weekly_target_hours", "vacation_quota", "vacation_used",
            "overtime_balance", "is_manager", "is_mission_manager",
            "is_active", "home_site", "password",
            "home_site_latitude", "home_site_longitude",
            # Domicile + trajet standard (Art. 13 al. 3 OLT 1).
            "home_lat", "home_lon", "standard_commute_minutes",
        ]
        # username is editable (superuser can rename collaborators).
        read_only_fields = ["id", "vacation_used", "overtime_balance", "is_superuser", "is_staff"]

    def create(self, validated_data):
        password = validated_data.pop("password", None) or UserProfile.objects.make_random_password()
        user = UserProfile(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
