"""Signaux applicatifs.

Garantit la cohérence des effets de bord lorsque les modèles sont
modifiés par n'importe quel chemin (admin Django natif, shell, API,
test, migration de données…).
"""
from __future__ import annotations

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.users.models import ConsentLog, ConsentWithdrawalRequest


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
