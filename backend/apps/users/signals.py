"""Signaux applicatifs.

Garantit la cohérence des effets de bord lorsque les modèles sont
modifiés par n'importe quel chemin (admin Django natif, shell, API,
test, migration de données…).
"""
from __future__ import annotations

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.users.models import (
    ConsentLog,
    ConsentWithdrawalRequest,
    HomeAddressChangeRequest,
)


# Cache du status précédent pour détecter la transition PENDING → APPROVED.
@receiver(pre_save, sender=ConsentWithdrawalRequest)
def _cache_previous_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._previous_status = (
                ConsentWithdrawalRequest.objects.only("status")
                .get(pk=instance.pk).status
            )
        except ConsentWithdrawalRequest.DoesNotExist:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender=ConsentWithdrawalRequest)
def _apply_consent_withdrawal(sender, instance, created, **kwargs):
    """Quand une demande passe à APPROVED, créer le ConsentLog inverse.

    Couvre TOUTES les voies de modification : API admin, Django admin natif,
    shell, modifications de données par migration… Sans ça, un admin qui
    approuve via /admin/ n'invalide jamais le consentement réel.
    """
    if created:
        return
    if instance.status != ConsentWithdrawalRequest.Status.APPROVED:
        return
    if getattr(instance, "_previous_status", None) == ConsentWithdrawalRequest.Status.APPROVED:
        # Pas une transition — déjà traité, idempotent.
        return

    # Idempotence : si le dernier ConsentLog est déjà granted=False pour ce
    # kind, ne pas en créer un doublon.
    last = (
        ConsentLog.objects
        .filter(user=instance.user, kind=instance.kind)
        .order_by("-created_at")
        .first()
    )
    if not (last and last.granted is False):
        ConsentLog.objects.create(
            user=instance.user,
            kind=instance.kind,
            granted=False,
            policy_version="",  # le retrait n'a pas de version applicable
        )

    # Si on retire le consentement à la POLITIQUE DE CONFIDENTIALITÉ,
    # l'utilisateur ne peut plus utiliser légitimement la plateforme.
    # On force le ré-affichage de la gate de consentement à sa prochaine
    # connexion (`must_accept_consent=True` → ConsentGatePage bloquante).
    if instance.kind == "PRIVACY_POLICY":
        if not instance.user.must_accept_consent:
            instance.user.must_accept_consent = True
            instance.user.save(update_fields=["must_accept_consent"])


# ── HomeAddressChangeRequest : auto-apply quand APPROVED ───────────────
@receiver(pre_save, sender=HomeAddressChangeRequest)
def _cache_previous_home_address_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._previous_status = (
                HomeAddressChangeRequest.objects.only("status")
                .get(pk=instance.pk).status
            )
        except HomeAddressChangeRequest.DoesNotExist:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender=HomeAddressChangeRequest)
def _apply_home_address_change(sender, instance, created, **kwargs):
    """Quand une demande d'adresse passe à APPROVED, applique les nouvelles
    coordonnées sur le UserProfile (lat/lon) + tente un recalcul du trajet
    standard via ORS (best-effort, fail-open).

    Couvre TOUS les chemins (API admin, Django admin natif, shell…).
    """
    if created:
        return
    if instance.status != HomeAddressChangeRequest.Status.APPROVED:
        return
    if getattr(instance, "_previous_status", None) == HomeAddressChangeRequest.Status.APPROVED:
        return  # déjà traité

    user = instance.user
    user.home_lat = instance.new_home_lat
    user.home_lon = instance.new_home_lon
    # Le label humain est aussi propagé (sert à l'affichage UI).
    if instance.new_address_label:
        user.home_address_label = instance.new_address_label

    # Best-effort recompute commute via OpenRouteService (si ORS_API_KEY set).
    try:
        from services.routing import compute_minutes
        if user.home_site_id and user.home_site:
            new_minutes = compute_minutes(
                float(instance.new_home_lat), float(instance.new_home_lon),
                float(user.home_site.latitude), float(user.home_site.longitude),
            )
            if new_minutes is not None:
                user.standard_commute_minutes = new_minutes
    except Exception:
        pass  # fail-open : l'admin peut éditer manuellement la durée

    user.save(update_fields=[
        "home_lat", "home_lon", "home_address_label", "standard_commute_minutes",
    ])
