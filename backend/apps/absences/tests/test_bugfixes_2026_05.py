"""Régression tests pour les bugs corrigés (commit fd0d223) — partie absences.

Couvre :
  - B4 : vacation_used recompute centralisé (approve / reject / SICK overlap)
  - B6 : days_count exclut weekend + jours fériés du site de rattachement
  - D4 : Validation du quota à la création (400 si insuffisant)
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.absences.models import AbsenceRequest
from apps.users.models import Site, SiteHoliday, UserProfile


class B4VacationUsedRecomputeTests(TestCase):
    """B4 — recompute_vacation_used appelé automatiquement à approve/reject.

    Scénario complet :
      1. PENDING VACATION 5j → vacation_used reste 0
      2. Approve via API → vacation_used = 5
      3. Reject via API → vacation_used = 0
      4. Réapprouver + SICK chevauchante 2j → vacation_used = 3 (recrédit)
    """

    def setUp(self):
        self.client = APIClient()
        self.employee = UserProfile.objects.create_user(
            username="b4-emp", password="x",
            vacation_quota=25, vacation_used=Decimal("0"),
        )
        self.manager = UserProfile.objects.create_user(
            username="b4-mgr", password="x", is_manager=True,
        )

    def test_full_workflow_recompute_vacation_used(self):
        # May 18-22 2026 = Mon-Fri = 5 jours ouvrés.
        start = date(2026, 5, 18)
        end = date(2026, 5, 22)

        # 1. Créer une VACATION PENDING — vacation_used reste à 0.
        self.client.force_authenticate(self.employee)
        resp = self.client.post(reverse("absence-create"), {
            "absence_type": "VACATION",
            "date_start": start.isoformat(),
            "date_end": end.isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        vacation_pk = resp.data["id"]
        self.employee.refresh_from_db()
        self.assertEqual(
            self.employee.vacation_used, Decimal("0"),
            "PENDING ne doit jamais incrémenter vacation_used",
        )

        # 2. Approve → vacation_used = 5.
        self.client.force_authenticate(self.manager)
        resp = self.client.patch(
            reverse("absence-approve", args=[vacation_pk]),
            {"manager_comment": "OK"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.employee.refresh_from_db()
        self.assertEqual(
            self.employee.vacation_used, Decimal("5"),
            f"Après approve VACATION 5j : vacation_used doit = 5, got {self.employee.vacation_used}",
        )

        # 3. Reject → vacation_used = 0 à nouveau.
        resp = self.client.patch(
            reverse("absence-reject", args=[vacation_pk]),
            {"manager_comment": "Annulé"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.employee.refresh_from_db()
        self.assertEqual(
            self.employee.vacation_used, Decimal("0"),
            "Après reject : vacation_used doit revenir à 0",
        )

        # 4. Réapprouver la VACATION puis créer + approuver une SICK chevauchante 2j.
        #    On crée la SICK directement en BDD pour piloter le test.
        resp = self.client.patch(
            reverse("absence-approve", args=[vacation_pk]),
            {"manager_comment": "OK final"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.vacation_used, Decimal("5"))

        # SICK du 18 et 19 mai (2 jours civils chevauchant la VACATION).
        sick = AbsenceRequest.objects.create(
            user=self.employee,
            absence_type=AbsenceRequest.AbsenceType.SICK,
            date_start=date(2026, 5, 18),
            date_end=date(2026, 5, 19),
            status=AbsenceRequest.Status.PENDING,
        )
        resp = self.client.patch(
            reverse("absence-approve", args=[sick.id]),
            {"manager_comment": "Cert médical"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.employee.refresh_from_db()
        # 5j VACATION - 2j de recrédit SICK = 3.
        self.assertEqual(
            self.employee.vacation_used, Decimal("3"),
            f"Recrédit SICK 2j : vacation_used doit = 3, got {self.employee.vacation_used}",
        )


class B6DaysCountExcludesWeekendAndHolidayTests(TestCase):
    """B6 — `days_count` exclut samedis, dimanches et SiteHoliday du home_site."""

    def setUp(self):
        self.site = Site.objects.create(
            name="Site B6", latitude=46.5, longitude=6.6,
            qr_code_token="b6-site-token", gps_radius_meters=150,
        )
        self.user = UserProfile.objects.create_user(
            username="b6-user", password="x", home_site=self.site,
        )

    def test_friday_to_monday_counts_as_two_working_days(self):
        # Vendredi 22 mai → Lundi 25 mai. Sam-Dim exclus → 2 jours.
        a = AbsenceRequest.objects.create(
            user=self.user, absence_type=AbsenceRequest.AbsenceType.VACATION,
            date_start=date(2026, 5, 22), date_end=date(2026, 5, 25),
            status=AbsenceRequest.Status.PENDING,
        )
        self.assertEqual(
            a.days_count, 2.0,
            f"Ven→Lun doit = 2 jours ouvrés, got {a.days_count}",
        )

    def test_holiday_in_middle_decreases_days_count(self):
        # Mardi 19 → Jeudi 21 mai = 3 jours ouvrés sans férié.
        # Avec un SiteHoliday le mercredi 20 → 2 jours ouvrés.
        SiteHoliday.objects.create(
            site=self.site, date=date(2026, 5, 20), name="Test Holiday",
        )
        a = AbsenceRequest.objects.create(
            user=self.user, absence_type=AbsenceRequest.AbsenceType.VACATION,
            date_start=date(2026, 5, 19), date_end=date(2026, 5, 21),
            status=AbsenceRequest.Status.PENDING,
        )
        self.assertEqual(
            a.days_count, 2.0,
            f"Mar→Jeu avec férié au milieu doit = 2, got {a.days_count}",
        )

    def test_no_holiday_no_home_site_falls_back_to_weekdays_only(self):
        # User sans home_site → pas de fériés à exclure, juste weekend.
        u_no_site = UserProfile.objects.create_user(username="b6-nosite", password="x")
        a = AbsenceRequest.objects.create(
            user=u_no_site, absence_type=AbsenceRequest.AbsenceType.VACATION,
            date_start=date(2026, 5, 19), date_end=date(2026, 5, 21),
            status=AbsenceRequest.Status.PENDING,
        )
        self.assertEqual(a.days_count, 3.0)


class D4QuotaValidationAtCreationTests(TestCase):
    """D4 — Validation du quota au moment de la création POST."""

    def setUp(self):
        self.client = APIClient()
        self.employee = UserProfile.objects.create_user(
            username="d4-emp", password="x",
            vacation_quota=10, vacation_used=Decimal("0"),
        )
        # Manager pour pouvoir approuver les 8 jours préalables.
        self.manager = UserProfile.objects.create_user(
            username="d4-mgr", password="x", is_manager=True,
        )

    def test_post_vacation_exceeds_remaining_returns_400(self):
        # On crée 8 jours déjà approuvés en base : May 4-13 2026 = 8 jours ouvrés.
        a = AbsenceRequest.objects.create(
            user=self.employee,
            absence_type=AbsenceRequest.AbsenceType.VACATION,
            date_start=date(2026, 5, 4),
            date_end=date(2026, 5, 13),
            status=AbsenceRequest.Status.APPROVED,
        )
        # Vérifie que 8j sont bien compté en mémoire.
        self.assertEqual(a.days_count, 8.0)

        # Sync vacation_used via recompute.
        from services.vacation import recompute_vacation_used
        recompute_vacation_used(self.employee)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.vacation_used, Decimal("8"))

        # Quota = 10, used = 8 → remaining = 2. Demande de 5j → 400.
        self.client.force_authenticate(self.employee)
        resp = self.client.post(reverse("absence-create"), {
            "absence_type": "VACATION",
            "date_start": date(2026, 5, 18).isoformat(),
            "date_end": date(2026, 5, 22).isoformat(),  # 5 jours ouvrés
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        # Le serializer renvoie la liste/dict — on cherche le message clé.
        msg = str(resp.data)
        self.assertIn("Solde de congés insuffisant", msg)
