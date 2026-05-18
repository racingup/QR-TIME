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
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING,
        db_index=True,  # Filtre fréquent (PendingAbsencesView, recompute_vacation_used)
    )
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
        indexes = [
            # Hot path : recompute_vacation_used filtre par (user, absence_type, status).
            models.Index(fields=["user", "absence_type", "status"]),
            # Hot path : recherche par chevauchement de période (overlap check).
            models.Index(fields=["user", "date_start", "date_end"]),
        ]

    @property
    def days_count(self) -> float:
        """Number of *working* days covered, accounting for half-days.

        **Exclut** les samedis, dimanches et jours fériés du site de
        rattachement de l'employé. Un congé soumis du vendredi au lundi
        compte 2 jours, pas 4. Idem pour un jour férié au milieu.

        Convention demi-jours :
          - half_day_start = True  → l'employé travaille le matin du 1er jour
                                     (n'est absent que l'après-midi de date_start)
          - half_day_end   = True  → l'employé travaille l'après-midi du dernier jour
                                     (n'est absent que le matin de date_end)

        **Cache** : l'ensemble des fériés est mémoïsé par instance pour
        éviter de re-requêter la DB à chaque accès (la property est lue
        plusieurs fois par render).
        """
        cached = getattr(self, "_days_count_cache", None)
        if cached is not None:
            return cached

        from datetime import timedelta

        # Construire l'ensemble des fériés du site de rattachement.
        holiday_dates: set = set()
        site_id = getattr(self.user, "home_site_id", None)
        if site_id:
            from apps.users.models import SiteHoliday
            holiday_dates = set(
                SiteHoliday.objects.filter(
                    site_id=site_id,
                    date__gte=self.date_start,
                    date__lte=self.date_end,
                ).values_list("date", flat=True)
            )

        def is_working_day(d) -> bool:
            return d.weekday() < 5 and d not in holiday_dates

        # Compter les jours ouvrés réels.
        d = self.date_start
        working_days = 0
        while d <= self.date_end:
            if is_working_day(d):
                working_days += 1
            d += timedelta(days=1)

        if working_days == 0:
            self._days_count_cache = 0.0
            return 0.0

        # Appliquer les demi-jours UNIQUEMENT si le jour concerné est ouvré.
        if self.date_start == self.date_end:
            if self.half_day_start and self.half_day_end:
                self._days_count_cache = 0.0
            elif self.half_day_start or self.half_day_end:
                self._days_count_cache = 0.5
            else:
                self._days_count_cache = float(working_days)
            return self._days_count_cache

        delta = 0.0
        if self.half_day_start and is_working_day(self.date_start):
            delta += 0.5
        if self.half_day_end and is_working_day(self.date_end):
            delta += 0.5
        self._days_count_cache = working_days - delta
        return self._days_count_cache

    def refresh_from_db(self, *args, **kwargs):
        # Invalider le cache si l'objet est rechargé.
        self._days_count_cache = None
        return super().refresh_from_db(*args, **kwargs)

    def save(self, *args, **kwargs):
        # Invalider le cache au save (dates ou flags peuvent changer).
        self._days_count_cache = None
        return super().save(*args, **kwargs)
