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

    # ── Domicile (sélectionné sur carte par l'admin) ─────────────────────
    # Sert au calcul du temps de trajet supplémentaire en mission (Art. 13
    # OLT 1) : trajet domicile → mission, MOINS le trajet standard
    # domicile → home_site (qui aurait été fait de toute façon).
    home_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text="Latitude du domicile, sélectionnée sur carte par l'admin.",
    )
    home_lon = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text="Longitude du domicile, sélectionnée sur carte par l'admin.",
    )
    standard_commute_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text=(
            "Trajet standard domicile → site de rattachement, ALLER SIMPLE en "
            "minutes. Recalculé automatiquement quand l'adresse domicile ou le "
            "site changent ; éditable manuellement par l'admin."
        ),
    )

    # ── Règles de travail ─────────────────────────────────────────────────
    exempt_from_clocking = models.BooleanField(
        default=False,
        help_text="Non soumis au timbrage (planification = preuve de présence).",
    )
    can_edit_locked_months = models.BooleanField(
        default=False,
        help_text="Autorisé à modifier des pointages sur des mois verrouillés.",
    )
    manager = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reports",
        help_text="Manager direct (utilisé pour les notifications email).",
    )
    must_accept_consent = models.BooleanField(
        default=True,
        help_text="True → l'employé doit accepter les 3 consentements avant d'accéder à la plateforme.",
    )

    @property
    def daily_target_hours(self) -> Decimal:
        """Heures théoriques par jour ouvré (semaine de 5 jours)."""
        return (self.weekly_target_hours or Decimal("0")) / Decimal("5")

    @property
    def has_home_address(self) -> bool:
        """True si l'admin a renseigné les coordonnées du domicile."""
        return self.home_lat is not None and self.home_lon is not None


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


class WorkTimePolicy(models.Model):
    """Politique de temps de travail paramétrable (singleton).

    Tous les seuils et règles sont configurables par l'admin sans déploiement.
    """

    LOCK_BYPASS_CHOICES = [
        ("superuser", "Superuser uniquement"),
        ("manager", "Manager et superuser"),
        ("any", "Tous les utilisateurs"),
    ]

    # ── Verrou mensuel ────────────────────────────────────────────────────
    month_lock_day = models.PositiveSmallIntegerField(
        default=10,
        help_text="Après ce jour du mois, le mois précédent est verrouillé.",
    )
    lock_bypass_roles = models.CharField(
        max_length=20, choices=LOCK_BYPASS_CHOICES, default="superuser",
        help_text="Rôles autorisés à modifier un mois verrouillé.",
    )

    # ── Pauses obligatoires ───────────────────────────────────────────────
    break_trigger_minutes = models.PositiveIntegerField(
        default=360,
        help_text="Durée travaillée (min) déclenchant la pause obligatoire (360 = 6h).",
    )
    break_duration_minutes = models.PositiveIntegerField(
        default=30, help_text="Durée de la pause obligatoire en minutes.",
    )
    paid_break_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Minutes de pause considérées comme travaillées (pause payée).",
    )
    auto_deduct_break = models.BooleanField(
        default=False,
        help_text="Déduire automatiquement la pause du temps travaillé.",
    )

    # ── Journée ───────────────────────────────────────────────────────────
    daily_min_minutes = models.PositiveIntegerField(
        default=0, help_text="Durée minimale journalière en minutes.",
    )
    daily_max_minutes = models.PositiveIntegerField(
        default=630, help_text="Durée maximale journalière en minutes (630 = 10h30).",
    )
    eve_holiday_reduced_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Durée réduite les veilles de jours fériés (0 = désactivé).",
    )

    class Meta:
        verbose_name = "Politique de temps de travail"
        verbose_name_plural = "Politique de temps de travail"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "WorkTimePolicy":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class MajorationRule(models.Model):
    """Règle de majoration horaire paramétrable par l'admin.

    Plusieurs règles peuvent coexister (ex : +25% au-delà de 8h30 en semaine,
    +50% le weekend). Triées par `order` puis `threshold_minutes`.
    """

    class DayType(models.TextChoices):
        ALL     = "ALL",     "Tous les jours"
        WEEKDAY = "WEEKDAY", "Jours ouvrés (lun–ven)"
        WEEKEND = "WEEKEND", "Weekend (sam–dim)"
        HOLIDAY = "HOLIDAY", "Jours fériés"

    description       = models.CharField(max_length=100, help_text="Libellé (ex: Heures supplémentaires)")
    day_type          = models.CharField(max_length=10, choices=DayType.choices, default=DayType.ALL)
    threshold_minutes = models.PositiveIntegerField(
        default=510, help_text="Seuil de déclenchement en minutes (ex: 510 = 8h30).",
    )
    rate              = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("1.25"),
        help_text="Taux de majoration (ex: 1.25 = 125%).",
    )
    is_active         = models.BooleanField(default=True)
    order             = models.PositiveSmallIntegerField(
        default=0, help_text="Ordre d'application (plus petit = prioritaire).",
    )

    class Meta:
        ordering = ["order", "threshold_minutes"]
        verbose_name = "Règle de majoration"
        verbose_name_plural = "Règles de majoration"

    def __str__(self) -> str:
        h, m = divmod(self.threshold_minutes, 60)
        return f"{self.description} ({self.get_day_type_display()}, ×{self.rate} après {h}h{m:02d})"


class CompanySettings(models.Model):
    """Identification + branding de l'entreprise utilisatrice (singleton).

    Pourquoi un singleton plutôt qu'un modèle multi-tenant : qrtime.ch est
    déployé en *single-tenant* (une instance par client). Un seul jeu de
    settings global suffit ; pas besoin d'un `tenant_id` partout.

    Les champs identification servent à interpoler la politique de
    confidentialité (LPD : nom du responsable, contact DPO, adresse, etc.).
    Les champs branding (logo, couleurs) sont injectés au boot du frontend
    via un endpoint public-auth.

    Logo stocké comme **data URL base64** dans un TextField :
    - Pas besoin de configurer MEDIA_ROOT / volume Docker → déploiement plus
      simple, pas de gestion de droits / purge LPD séparée
    - Backup couvert automatiquement par le pg_dump quotidien (`ops/backup.sh`)
    - Limite raisonnable : ~150 KB (côté frontend on redimensionne à 256 px max
      avant envoi → ~10-20 KB en base64). Plus efficace serait OBVIOUSLY un
      blob storage, mais overkill pour un logo qui ne change presque jamais.
    """

    # ── Identification (interpolée dans la politique de confidentialité) ──
    name = models.CharField(
        max_length=200, blank=True,
        help_text="Raison sociale (ex : Acme SA).",
    )
    legal_form = models.CharField(
        max_length=20, blank=True,
        help_text="Forme juridique (SA, Sàrl, AG, GmbH, association, …).",
    )
    address_line = models.CharField(max_length=200, blank=True)
    postal_code = models.CharField(max_length=10, blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=80, blank=True, default="Suisse")
    dpo_contact_email = models.EmailField(
        blank=True,
        help_text="Email de contact pour les questions liées à la protection "
                  "des données (Art. 14 LPD — contact du responsable).",
    )
    dpo_contact_phone = models.CharField(max_length=40, blank=True)
    privacy_policy_extra = models.TextField(
        blank=True,
        help_text="Texte libre ajouté en bas de la politique de confidentialité "
                  "(ex : mentions sectorielles, sous-traitants spécifiques).",
    )

    # ── Branding (logo + couleurs) ────────────────────────────────────────
    logo_data_url = models.TextField(
        blank=True,
        help_text="Logo en data URL base64 (data:image/png;base64,…). "
                  "Limite recommandée : 150 KB (256 px max).",
    )
    primary_color = models.CharField(
        max_length=9, blank=True, default="#1e3a5f",
        help_text="Couleur primaire (hex, ex : #1e3a5f). Injectée comme "
                  "var CSS --brand-primary au boot frontend.",
    )
    secondary_color = models.CharField(
        max_length=9, blank=True, default="#10b981",
        help_text="Couleur secondaire (accents).",
    )

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "users.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )

    class Meta:
        verbose_name = "Paramètres entreprise"
        verbose_name_plural = "Paramètres entreprise"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "CompanySettings":
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
        SESSION_DELETE = "SESSION_DELETE", "Suppression d'un pointage"
        DELETION_REQUEST_CREATED = "DELETION_REQUEST_CREATED", "Demande de suppression compte (employé)"
        DELETION_REQUEST_APPROVED = "DELETION_REQUEST_APPROVED", "Demande approuvée (anonymisation effectuée)"
        DELETION_REQUEST_REJECTED = "DELETION_REQUEST_REJECTED", "Demande refusée"
        ABSENCE_DECISION = "ABSENCE_DECISION", "Décision sur une absence"
        MISSION_DECISION = "MISSION_DECISION", "Décision sur une mission"
        DATA_EXPORT = "DATA_EXPORT", "Export de données utilisateur"
        SITE_QR_ROTATE = "SITE_QR_ROTATE", "Rotation QR site"
        DATA_PURGED = "DATA_PURGED", "Purge rétention LPD"
        CONSENT_WITHDRAWAL_CREATED  = "CONSENT_WITHDRAWAL_CREATED",  "Demande retrait consentement (employé)"
        CONSENT_WITHDRAWAL_APPROVED = "CONSENT_WITHDRAWAL_APPROVED", "Retrait consentement approuvé"
        CONSENT_WITHDRAWAL_REJECTED = "CONSENT_WITHDRAWAL_REJECTED", "Retrait consentement refusé"
        CONSENT_INITIAL_ACCEPTED    = "CONSENT_INITIAL_ACCEPTED",    "Consentements initiaux acceptés"

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


class DataDeletionRequest(models.Model):
    """Demande de suppression du compte par un collaborateur (LPD Art. 32 al. 2).

    Important : on N'ANONYMISE PAS directement à la demande, car la suppression
    d'un compte salarié actif constitue de facto une rupture de la relation de
    travail. Le workflow est :

      1. L'employé soumet la demande (status = PENDING) via /api/me/deletion-request/
      2. L'admin / RH la traite via l'espace admin
      3. Si APPROVED → exécution de `anonymize_user()` + status = FULFILLED
      4. Si REJECTED → trace avec motif (ex: "départ en cours, RH gère via SIRH")

    Le collaborateur ne peut pas avoir 2 demandes PENDING simultanément.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        APPROVED = "APPROVED", "Approuvée et anonymisation effectuée"
        REJECTED = "REJECTED", "Refusée"

    user = models.ForeignKey(
        "users.UserProfile", on_delete=models.CASCADE,
        related_name="deletion_requests",
    )
    user_reason = models.TextField(
        blank=True,
        help_text="Motif libre laissé par le collaborateur (optionnel).",
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING,
    )
    decided_by = models.ForeignKey(
        "users.UserProfile", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="decided_deletion_requests",
    )
    admin_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Garde-fou métier : 1 seule demande PENDING active à la fois.
            # Permet plusieurs demandes historiques (rejected/fulfilled).
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(status="PENDING"),
                name="unique_pending_deletion_request_per_user",
            ),
        ]


class ConsentWithdrawalRequest(models.Model):
    """Demande de retrait de consentement par un collaborateur.

    Le retrait n'est PAS immédiat : il est transmis à l'admin/RH qui
    décide de l'accepter ou non (impact contractuel possible).

    Workflow identique à DataDeletionRequest.
    """

    class Status(models.TextChoices):
        PENDING  = "PENDING",  "En attente"
        APPROVED = "APPROVED", "Approuvée — consentement retiré"
        REJECTED = "REJECTED", "Refusée"

    class Kind(models.TextChoices):
        GPS            = "GPS",            "Géolocalisation"
        STORAGE        = "STORAGE",        "Stockage local de session"
        PRIVACY_POLICY = "PRIVACY_POLICY", "Politique de confidentialité"

    user = models.ForeignKey(
        "users.UserProfile", on_delete=models.CASCADE,
        related_name="consent_withdrawal_requests",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    user_reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING,
    )
    decided_by = models.ForeignKey(
        "users.UserProfile", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="decided_consent_withdrawals",
    )
    admin_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "kind"],
                condition=models.Q(status="PENDING"),
                name="unique_pending_consent_withdrawal_per_user_kind",
            ),
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
