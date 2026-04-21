"""User, Site, and tolerance configuration models."""
from __future__ import annotations

import uuid
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


def _new_token() -> str:
    return uuid.uuid4().hex


class UserProfile(AbstractUser):
    """Employee account; extends Django's AbstractUser."""

    weekly_target_hours = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("42.00"),
    )
    vacation_quota = models.PositiveIntegerField(default=25)
    vacation_used = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0.00"),
    )
    overtime_balance = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0.00"),
        help_text="Solde heures sup en heures (positif ou négatif).",
    )
    is_manager = models.BooleanField(default=False)

    @property
    def daily_target_hours(self) -> Decimal:
        """Heures théoriques par jour ouvré (semaine de 5 jours)."""
        return (self.weekly_target_hours or Decimal("0")) / Decimal("5")


class Site(models.Model):
    """Lieu de travail physique (siège, bureau)."""

    name = models.CharField(max_length=120, unique=True)
    qr_code_token = models.CharField(max_length=64, unique=True, default=_new_token)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    gps_radius_meters = models.PositiveIntegerField(
        default=150, validators=[MinValueValidator(10)],
    )
    token_updated_at = models.DateTimeField(default=timezone.now)

    def regenerate_token(self) -> str:
        self.qr_code_token = _new_token()
        self.token_updated_at = timezone.now()
        self.save(update_fields=["qr_code_token", "token_updated_at"])
        return self.qr_code_token

    def __str__(self) -> str:
        return self.name


class ToleranceConfig(models.Model):
    """Configuration globale des arrondis (singleton)."""

    class Direction(models.TextChoices):
        DOWN = "DOWN", "Arrondi inférieur"
        UP = "UP", "Arrondi supérieur"
        NEAREST = "NEAREST", "Plus proche"

    tolerance_minutes = models.PositiveSmallIntegerField(default=5)
    rounding_direction = models.CharField(
        max_length=10, choices=Direction.choices, default=Direction.NEAREST,
    )

    class Meta:
        verbose_name = "Tolérance d'arrondi"
        verbose_name_plural = "Tolérance d'arrondi"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "ToleranceConfig":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class SiteQRAudit(models.Model):
    """Audit log of QR-token regenerations on a Site."""

    site = models.ForeignKey(
        Site, on_delete=models.CASCADE, related_name="qr_audits",
    )
    old_token = models.CharField(max_length=64)
    new_token = models.CharField(max_length=64)
    regenerated_by = models.ForeignKey(
        "users.UserProfile", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="qr_regenerations",
    )
    regenerated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-regenerated_at"]
