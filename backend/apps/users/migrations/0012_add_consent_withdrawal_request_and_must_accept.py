"""
Add must_accept_consent to UserProfile and ConsentWithdrawalRequest model.
Also adds 4 new AdminAuditLog.Action choices (no schema change needed for TextChoices).
"""
from __future__ import annotations

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0011_work_time_policy_and_majoration_rules"),
    ]

    operations = [
        # 1. Add must_accept_consent on UserProfile
        migrations.AddField(
            model_name="userprofile",
            name="must_accept_consent",
            field=models.BooleanField(
                default=True,
                help_text="True → l'employé doit accepter les 3 consentements avant d'accéder à la plateforme.",
            ),
        ),
        # 2. New ConsentWithdrawalRequest model
        migrations.CreateModel(
            name="ConsentWithdrawalRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("GPS", "Géolocalisation"),
                            ("STORAGE", "Stockage local de session"),
                            ("PRIVACY_POLICY", "Politique de confidentialité"),
                        ],
                        max_length=32,
                    ),
                ),
                ("user_reason", models.TextField(blank=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "En attente"),
                            ("APPROVED", "Approuvée — consentement retiré"),
                            ("REJECTED", "Refusée"),
                        ],
                        default="PENDING",
                        max_length=10,
                    ),
                ),
                ("admin_comment", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                (
                    "decided_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="decided_consent_withdrawals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="consent_withdrawal_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="consentwithdrawalrequest",
            constraint=models.UniqueConstraint(
                condition=models.Q(status="PENDING"),
                fields=["user", "kind"],
                name="unique_pending_consent_withdrawal_per_user_kind",
            ),
        ),
    ]
