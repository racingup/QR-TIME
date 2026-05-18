"""ClockSession, FixedTimeSlot, and Alert models."""
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


class Alert(models.Model):
    """Alerte générée par le système pour le manager (oubli, justif, …)."""

    class Kind(models.TextChoices):
        FORGOTTEN_CLOCKOUT = "FORGOTTEN_CLOCKOUT", "Oubli de pointage"

    kind = models.CharField(max_length=32, choices=Kind.choices)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alerts",
        help_text="Employé concerné par l'alerte.",
    )
    session = models.ForeignKey(
        ClockSession, on_delete=models.CASCADE,
        null=True, blank=True, related_name="alerts",
    )
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Un seul alert "FORGOTTEN_CLOCKOUT" par session.
            models.UniqueConstraint(
                fields=["kind", "session"],
                name="unique_alert_per_session_kind",
            ),
        ]

    @property
    def is_resolved(self) -> bool:
        return self.resolved_at is not None


class DailyOvertime(models.Model):
    """Contribution quotidienne au solde d'heures supplémentaires.

    Pour chaque (user, day), on stocke le delta (positif ou négatif) que
    cette journée représente après application des règles de majoration.

    Pourquoi un modèle dédié plutôt qu'un simple compteur ?
      • Idempotence : recompute(user, day) UPSERT la ligne (pas de double
        comptage si on rejoue le calcul après une édition manuelle).
      • Performance : le solde total = SUM(hours) sur cette table —
        O(N_jours) une fois, O(1) à la lecture par cache UserProfile.
      • Audit : on garde la trace de quelle journée contribue à combien.
    """

    user = models.ForeignKey(
        "users.UserProfile", on_delete=models.CASCADE,
        related_name="daily_overtime",
    )
    date = models.DateField()
    hours = models.DecimalField(
        max_digits=6, decimal_places=2,
        help_text="Delta pondéré en heures (positif = sup, négatif = déficit).",
    )
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Overtime quotidien"
        verbose_name_plural = "Overtime quotidiens"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                name="unique_daily_overtime_per_user_day",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "date"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.date} {self.hours}h"
