"""AbsenceRequest model — congés / maladie / autres."""
from __future__ import annotations

from django.conf import settings
from django.db import models


class AbsenceRequest(models.Model):
    class AbsenceType(models.TextChoices):
        VACATION = "VACATION", "Congés"
        SICK = "SICK", "Maladie"
        OTHER = "OTHER", "Autre"

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        APPROVED = "APPROVED", "Approuvée"
        REJECTED = "REJECTED", "Refusée"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="absences",
    )
    absence_type = models.CharField(max_length=10, choices=AbsenceType.choices)
    date_start = models.DateField()
    date_end = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    manager_comment = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="approved_absences",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
