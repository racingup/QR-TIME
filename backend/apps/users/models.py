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
    is_mission_manager = models.BooleanField(
        default=False,
        help_text="Peut attribuer et valider des missions transversalement (tous sites).",
    )
    home_site = models.ForeignKey(
        "users.Site",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="users",
        help_text="Site de rattachement principal du collaborateur.",
    )

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


class SiteHoliday(models.Model):
    """Jour férié spécifique à un site (ex : journée portes fermées, pont, …)."""

    site = models.ForeignKey(
        Site, on_delete=models.CASCADE, related_name="holidays",
    )
    date = models.DateField()
    name = models.CharField(max_length=100)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["site", "date"], name="unique_holiday_per_site_date"),
        ]

    def __str__(self) -> str:
        return f"{self.site.name} — {self.date} ({self.name})"


class ConsentLog(models.Model):
    """Trace des consentements (Art. 6 al. 6 LPD — preuve du consentement)."""

    class Kind(models.TextChoices):
        GPS = "GPS", "Géolocalisation pour pointage"
        STORAGE = "STORAGE", "Stockage local de la session (JWT)"
        PRIVACY_POLICY = "PRIVACY_POLICY", "Politique de confidentialité"

    user = models.ForeignKey(
        "users.UserProfile", on_delete=models.CASCADE, related_name="consents",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    granted = models.BooleanField()
    policy_version = models.CharField(max_length=20, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "kind", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user_id} {self.kind} {'✓' if self.granted else '✗'} @ {self.created_at}"


class AdminAuditLog(models.Model):
    """Journal des actions administratives sensibles (Art. 12 LPD + Art. 8 LPD).

    Permet de tracer qui (manager/superuser) a fait quoi sur les données
    d'un autre utilisateur. Volontairement append-only — ne jamais éditer.
    """

    class Action(models.TextChoices):
        USER_CREATE = "USER_CREATE", "Création utilisateur"
        USER_UPDATE = "USER_UPDATE", "Modification utilisateur"
        USER_DELETE = "USER_DELETE", "Suppression / anonymisation utilisateur"
        ROLE_CHANGE = "ROLE_CHANGE", "Changement de rôle"
        SESSION_EDIT = "SESSION_EDIT", "Édition d'un pointage"
        ABSENCE_DECISION = "ABSENCE_DECISION", "Décision sur une absence"
        MISSION_DECISION = "MISSION_DECISION", "Décision sur une mission"
        DATA_EXPORT = "DATA_EXPORT", "Export de données utilisateur"
        SITE_QR_ROTATE = "SITE_QR_ROTATE", "Rotation QR site"
        DATA_PURGED = "DATA_PURGED", "Purge rétention LPD"

    actor = models.ForeignKey(
        "users.UserProfile", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="audit_actions",
        help_text="Qui a effectué l'action (null si système).",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    target_user = models.ForeignKey(
        "users.UserProfile", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="audit_targets",
        help_text="Sur quel utilisateur l'action a porté.",
    )
    object_type = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=80, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["target_user", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
        ]


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
