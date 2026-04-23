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
    mission_number = models.CharField(
        max_length=40, blank=True,
        help_text="Numéro de mission attribué par le manager / mission manager / admin.",
    )
    qr_token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="approved_missions",
    )
    user_comment = models.TextField(
        blank=True,
        help_text="Commentaire libre laissé par l'employé à la soumission "
                  "(contexte, motif, instructions spéciales).",
    )
    manager_comment = models.TextField(blank=True)

    # ── Trajet professionnel (Art. 13 al. 3 OLT 1) ─────────────────────
    # Calculés au moment de l'approbation. travel_minutes_actual est le
    # trajet aller domicile → mission (sans ×2). compensable est le temps
    # de trajet A/R *crédité* au collaborateur, après déduction du trajet
    # standard A/R domicile → site de rattachement.
    # Tous deux figés à l'approbation pour que le calcul soit reproductible.
    travel_minutes_actual = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Trajet aller domicile → mission, en minutes (snapshot à l'approbation).",
    )
    travel_minutes_compensable = models.PositiveIntegerField(
        null=True, blank=True,
        help_text=(
            "Temps de trajet A/R compensé : max(0, (actual − standard_commute) × 2). "
            "Ajouté au temps de mission pour le calcul des heures."
        ),
    )

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
        # Snapshot du temps de trajet professionnel (Art. 13 al. 3 OLT 1).
        # Calculé UNIQUEMENT pour les missions FIELD avec coordonnées GPS —
        # le télétravail (REMOTE) n'implique aucun déplacement.
        if self.mission_type == self.Type.FIELD:
            self._snapshot_travel_minutes()
        self.save()

    def _snapshot_travel_minutes(self) -> None:
        """Calcule et stocke le trajet aller + le compensable A/R.
        Fail-open : si le routing échoue, les champs restent à None et la
        mission s'approuve quand même (l'admin peut éditer ces minutes plus
        tard à la main si besoin)."""
        from services.routing import (
            compensable_round_trip_minutes,
            compute_mission_travel_minutes,
        )
        actual = compute_mission_travel_minutes(self.user, self)
        self.travel_minutes_actual = actual
        self.travel_minutes_compensable = compensable_round_trip_minutes(
            actual_one_way=actual,
            standard_one_way=self.user.standard_commute_minutes,
        )

    def reject(self, manager, comment: str = "") -> None:
        self.status = self.Status.REJECTED
        self.approved_by = manager
        self.manager_comment = comment
        self.save()
