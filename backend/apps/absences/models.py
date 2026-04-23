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
    half_day_start = models.BooleanField(
        default=False,
        help_text="Si vrai, absent uniquement l'après-midi du jour de début.",
    )
    half_day_end = models.BooleanField(
        default=False,
        help_text="Si vrai, absent uniquement le matin du jour de fin.",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    user_comment = models.TextField(
        blank=True,
        help_text="Commentaire libre laissé par l'employé à la soumission.",
    )
    manager_comment = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="approved_absences",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def days_count(self) -> float:
        """Number of working days covered, accounting for half-days.

        Convention:
          - half_day_start = True  → l'employé travaille le matin du 1er jour
                                     (n'est absent que l'après-midi de date_start)
          - half_day_end   = True  → l'employé travaille l'après-midi du dernier jour
                                     (n'est absent que le matin de date_end)

        Same-day request (date_start == date_end):
          - aucun flag       → 1 jour
          - half_day_start   → 0.5 (après-midi seulement)
          - half_day_end     → 0.5 (matin seulement)
          - les deux         → 0   (combinaison invalide, ignorée)
        """
        whole = (self.date_end - self.date_start).days + 1
        if self.date_start == self.date_end:
            if self.half_day_start and self.half_day_end:
                return 0.0
            if self.half_day_start or self.half_day_end:
                return 0.5
            return float(whole)
        delta = 0.0
        if self.half_day_start:
            delta += 0.5
        if self.half_day_end:
            delta += 0.5
        return whole - delta
