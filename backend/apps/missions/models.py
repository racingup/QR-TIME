"""Mission model — télétravail ou mission externe approuvée par un manager."""
from __future__ import annotations

import secrets

from django.conf import settings
from django.db import models


class Mission(models.Model):
    class Type(models.TextChoices):
        REMOTE = "REMOTE", "Télétravail"
        FIELD = "FIELD", "Mission externe"

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        APPROVED = "APPROVED", "Approuvée"
        REJECTED = "REJECTED", "Refusée"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="missions",
    )
    mission_type = models.CharField(max_length=10, choices=Type.choices)
    date_start = models.DateField()
    date_end = models.DateField()
    location_name = models.CharField(max_length=200, blank=True)
    location_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_lon = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    gps_radius_meters = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Rayon GPS pour cette mission (None = pas de validation GPS).",
    )
    qr_token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="approved_missions",
    )
    manager_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def approve(self, manager, comment: str = "") -> None:
        self.status = self.Status.APPROVED
        self.approved_by = manager
        self.manager_comment = comment
        if not self.qr_token:
            self.qr_token = secrets.token_urlsafe(32)
        self.save()

    def reject(self, manager, comment: str = "") -> None:
        self.status = self.Status.REJECTED
        self.approved_by = manager
        self.manager_comment = comment
        self.save()
