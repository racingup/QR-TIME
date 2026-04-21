"""ClockSession and FixedTimeSlot models."""
from __future__ import annotations

from django.conf import settings
from django.db import models


class FixedTimeSlot(models.Model):
    """Plage horaire obligatoire (ex: 09:30–11:30) configurable par l'admin."""

    name = models.CharField(max_length=80)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["start_time"]

    def __str__(self) -> str:
        return f"{self.name} ({self.start_time:%H:%M}–{self.end_time:%H:%M})"


class ClockSession(models.Model):
    """Une session de travail entre un clock_in et un clock_out."""

    class SessionType(models.TextChoices):
        OFFICE = "OFFICE", "Bureau"
        REMOTE = "REMOTE", "Télétravail"
        MISSION = "MISSION", "Mission externe"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions",
    )
    clock_in = models.DateTimeField()
    clock_out = models.DateTimeField(null=True, blank=True)
    clock_in_rounded = models.DateTimeField()
    clock_out_rounded = models.DateTimeField(null=True, blank=True)

    session_type = models.CharField(
        max_length=10, choices=SessionType.choices, default=SessionType.OFFICE,
    )
    site = models.ForeignKey(
        "users.Site", on_delete=models.PROTECT,
        null=True, blank=True, related_name="sessions",
    )
    mission = models.ForeignKey(
        "missions.Mission", on_delete=models.PROTECT,
        null=True, blank=True, related_name="sessions",
    )

    gps_lat_in = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    gps_lon_in = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    gps_lat_out = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    gps_lon_out = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    justification = models.TextField(blank=True)
    justification_approved = models.BooleanField(null=True, blank=True)
    is_forgotten = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-clock_in"]
        indexes = [
            models.Index(fields=["user", "clock_in"]),
            models.Index(fields=["clock_out"]),
        ]

    @property
    def is_open(self) -> bool:
        return self.clock_out is None

    @property
    def duration_minutes(self) -> int:
        if not self.clock_out_rounded:
            return 0
        delta = self.clock_out_rounded - self.clock_in_rounded
        return int(delta.total_seconds() // 60)
