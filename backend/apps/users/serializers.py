"""Serializers for the users app."""
from __future__ import annotations

from rest_framework import serializers

from apps.users.models import Site, SiteHoliday, ToleranceConfig, UserProfile


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


class AdminUserSerializer(serializers.ModelSerializer):
    """Manager-facing user editor."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = UserProfile
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "weekly_target_hours", "vacation_quota", "vacation_used",
            "overtime_balance", "is_manager", "is_mission_manager",
            "is_active", "home_site", "password",
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
