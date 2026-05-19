"""Admin/manager-facing endpoints under /api/admin/."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clocking.models import ClockSession
from apps.users.models import (
    AdminAuditLog,
    CompanySettings,
    ConsentLog,
    ConsentWithdrawalRequest,
    DataDeletionRequest,
    HomeAddressChangeRequest,
    MajorationRule,
    Site,
    SiteHoliday,
    SiteQRAudit,
    ToleranceConfig,
    UserProfile,
    WorkTimePolicy,
)
from apps.users.permissions import IsManager, IsSuperUser
from apps.users.serializers import (
    AdminUserSerializer,
    CompanySettingsSerializer,
    MajorationRuleSerializer,
    PublicBrandingSerializer,
    SiteHolidaySerializer,
    SiteSerializer,
    ToleranceConfigSerializer,
    WorkTimePolicySerializer,
)
from rest_framework.permissions import AllowAny


class SiteViewSet(viewsets.ModelViewSet):
    """CRUD on Sites — superuser only (réglage de paramétrage admin)."""

    queryset = Site.objects.all().order_by("name")
    serializer_class = SiteSerializer
    permission_classes = [IsSuperUser]

    @action(detail=True, methods=["get"], url_path="qr")
    def qr(self, request, pk=None):
        """GET /api/admin/sites/{id}/qr/ — site's QR as base64 PNG."""
        from services.qr import generate_png_base64
        site = self.get_object()
        return Response({
            "site_id": site.id,
            "site_name": site.name,
            "qr_token": site.qr_code_token,
            "qr_png_base64": generate_png_base64(site.qr_code_token),
            "token_updated_at": site.token_updated_at,
        })

    @action(detail=True, methods=["post"], url_path="regen-qr")
    def regen_qr(self, request, pk=None):
        """POST /api/admin/sites/{id}/regen-qr/ — rotate the site's QR token."""
        from services.audit import log_admin_action
        site = self.get_object()
        old_token = site.qr_code_token
        new_token = site.regenerate_token()
        SiteQRAudit.objects.create(
            site=site,
            old_token=old_token,
            new_token=new_token,
            regenerated_by=request.user,
        )
        log_admin_action(
            actor=request.user,
            action=AdminAuditLog.Action.SITE_QR_ROTATE,
            object_type="Site", object_id=site.id,
            details={"site_name": site.name},
            request=request,
        )
        return Response(
            {
                "site_id": site.id,
                "old_token": old_token,
                "new_token": new_token,
                "token_updated_at": site.token_updated_at,
            },
            status=status.HTTP_200_OK,
        )


class SiteHolidayViewSet(viewsets.ModelViewSet):
    """CRUD on holidays — superuser only (paramétrage des sites).

    `GET /api/admin/holidays/` lists everything; pass `?site=N` to filter.
    """

    serializer_class = SiteHolidaySerializer
    permission_classes = [IsSuperUser]

    def get_queryset(self):
        qs = SiteHoliday.objects.all().order_by("date")
        site_id = self.request.query_params.get("site")
        if site_id:
            qs = qs.filter(site_id=site_id)
        return qs


class ToleranceConfigView(APIView):
    """GET / PUT /api/admin/tolerance/ — singleton config (superuser only)."""

    permission_classes = [IsSuperUser]

    def get(self, request):
        return Response(ToleranceConfigSerializer(ToleranceConfig.load()).data)

    def put(self, request):
        config = ToleranceConfig.load()
        ser = ToleranceConfigSerializer(config, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class CompanySettingsAdminView(APIView):
    """GET / PUT /api/admin/company-settings/ — superuser only.

    Singleton (CompanySettings.load()). Le PUT accepte un payload partiel.
    """

    permission_classes = [IsSuperUser]

    def get(self, request):
        return Response(CompanySettingsSerializer(CompanySettings.load()).data)

    def put(self, request):
        from services.audit import log_admin_action
        config = CompanySettings.load()
        ser = CompanySettingsSerializer(config, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        config = ser.save(updated_by=request.user)
        log_admin_action(
            actor=request.user,
            action=AdminAuditLog.Action.USER_UPDATE,  # pas d'action dédiée — réutilisé
            object_type="CompanySettings",
            details={"fields_set": list(ser.validated_data.keys())},
            request=request,
        )
        return Response(CompanySettingsSerializer(config).data)


class MeCompanyView(APIView):
    """GET /api/me/company/ — payload entreprise complet pour user authentifié.

    Sert au boot de l'app et à interpoler la politique de confidentialité.
    Tous les champs sont en lecture seule pour les non-admins.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(CompanySettingsSerializer(CompanySettings.load()).data)


class PublicBrandingView(APIView):
    """GET /api/branding/ — payload visuel minimal, anonyme.

    Permet à la page de login d'afficher le logo et la couleur primaire
    AVANT que l'utilisateur ne s'authentifie. N'expose AUCUNE info sensible
    (email DPO, adresse, etc.) — juste ce qu'on voit déjà sur l'écran de
    login en l'absence d'auth.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []  # pas de check JWT, request anonyme

    def get(self, request):
        return Response(PublicBrandingSerializer(CompanySettings.load()).data)


PRIVACY_POLICY_VERSION = "2026-04-01"


def _client_ip(request):
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class MeConsentView(APIView):
    """GET / POST /api/me/consent/ — gestion du consentement (Art. 6 al. 6 LPD).

    GET  → état courant : {gps, storage, privacy_policy} (booléen + dernière maj)
    POST → enregistre un consentement : {kind, granted}
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        out = {"policy_version": PRIVACY_POLICY_VERSION}
        for kind in ("GPS", "STORAGE", "PRIVACY_POLICY"):
            last = (
                ConsentLog.objects
                .filter(user=request.user, kind=kind)
                .order_by("-created_at")
                .first()
            )
            out[kind.lower()] = (
                {
                    "granted": last.granted,
                    "policy_version": last.policy_version,
                    "at": last.created_at,
                }
                if last
                else None
            )
        return Response(out)

    def post(self, request):
        kind = request.data.get("kind")
        if kind not in ("GPS", "STORAGE", "PRIVACY_POLICY"):
            return Response({"error": "INVALID_KIND"}, status=status.HTTP_400_BAD_REQUEST)
        granted = bool(request.data.get("granted"))
        if not granted:
            # Le retrait de consentement passe par un workflow RH — pas un simple clic.
            return Response(
                {"error": "USE_WITHDRAWAL_REQUEST",
                 "hint": "POST /api/me/consent-withdrawal/ {kind, reason}"},
                status=status.HTTP_403_FORBIDDEN,
            )
        ConsentLog.objects.create(
            user=request.user,
            kind=kind,
            granted=granted,
            policy_version=PRIVACY_POLICY_VERSION if kind == "PRIVACY_POLICY" else "",
            ip_address=_client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:300],
        )
        return Response({"ok": True, "kind": kind, "granted": granted})


class MeExportView(APIView):
    """GET /api/me/export/ — droit d'accès et de portabilité (Art. 25 et 28 LPD).

    Retourne un JSON contenant toutes les données personnelles de l'utilisateur.
    Loggé dans AdminAuditLog (DATA_EXPORT) pour traçabilité.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.absences.models import AbsenceRequest
        from apps.absences.serializers import AbsenceRequestSerializer
        from apps.clocking.models import ClockSession
        from apps.clocking.serializers import ClockSessionSerializer
        from apps.missions.models import Mission
        from apps.missions.serializers import MissionSerializer
        from services.audit import log_admin_action

        user = request.user
        log_admin_action(
            actor=user, action=AdminAuditLog.Action.DATA_EXPORT,
            target_user=user, object_type="self_export",
            request=request,
        )
        return Response({
            "exported_at": timezone.now(),
            "policy_version": PRIVACY_POLICY_VERSION,
            "profile": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "weekly_target_hours": user.weekly_target_hours,
                "vacation_quota": user.vacation_quota,
                "vacation_used": user.vacation_used,
                "overtime_balance_hours": user.overtime_balance,
                "is_manager": user.is_manager,
                "is_superuser": user.is_superuser,
                "home_site_id": user.home_site_id,
                "date_joined": user.date_joined,
                "last_login": user.last_login,
            },
            "clock_sessions": ClockSessionSerializer(
                ClockSession.objects.filter(user=user).order_by("clock_in"), many=True,
            ).data,
            "missions": MissionSerializer(
                Mission.objects.filter(user=user).order_by("created_at"), many=True,
            ).data,
            "absences": AbsenceRequestSerializer(
                AbsenceRequest.objects.filter(user=user).order_by("created_at"), many=True,
            ).data,
            "consents": [
                {
                    "kind": c.kind, "granted": c.granted,
                    "policy_version": c.policy_version,
                    "at": c.created_at,
                }
                for c in user.consents.order_by("-created_at")
            ],
        })


class MeDeletionRequestView(APIView):
    """Workflow LPD Art. 32 al. 2 — *demande* de suppression de compte.

    Avant : la suppression était immédiate, ce qui équivaut de facto à une
    rupture du contrat de travail. C'était dangereux pour le collaborateur
    (perte d'accès) ET pour l'employeur (rupture sans process RH).

    Maintenant : on crée une `DataDeletionRequest` PENDING. L'admin/RH
    valide hors-bande (typiquement après le solde de tout compte) puis
    approuve depuis l'espace admin → ce moment-là seulement déclenche
    `anonymize_user()`.

    GET  → retourne la demande active (PENDING) du user, ou null
    POST → crée une nouvelle demande PENDING (refus si une autre est déjà active)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        active = (
            DataDeletionRequest.objects
            .filter(user=request.user, status=DataDeletionRequest.Status.PENDING)
            .first()
        )
        if not active:
            return Response({"pending": None})
        return Response({"pending": _serialize_deletion_request(active)})

    def post(self, request):
        from services.audit import log_admin_action
        if request.user.is_superuser:
            return Response(
                {"error": "SUPERUSER_CANNOT_SELF_DELETE",
                 "hint": "Demandez à un autre superuser de supprimer ce compte."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.data.get("confirm") != "DELETE":
            return Response(
                {"error": "CONFIRMATION_REQUIRED",
                 "hint": 'POST {"confirm": "DELETE", "reason": "..."}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Garde-fou : pas de doublon PENDING (la contrainte BDD le bloquerait
        # mais on renvoie un message clair plutôt qu'une 500).
        existing = DataDeletionRequest.objects.filter(
            user=request.user, status=DataDeletionRequest.Status.PENDING,
        ).first()
        if existing:
            return Response(
                {"error": "ALREADY_PENDING",
                 "hint": "Une demande est déjà en cours de traitement.",
                 "request": _serialize_deletion_request(existing)},
                status=status.HTTP_409_CONFLICT,
            )
        req = DataDeletionRequest.objects.create(
            user=request.user,
            user_reason=str(request.data.get("reason") or "")[:1000],
        )
        log_admin_action(
            actor=request.user, action=AdminAuditLog.Action.DELETION_REQUEST_CREATED,
            target_user=request.user, object_type="DataDeletionRequest",
            object_id=req.id,
            details={"reason": req.user_reason},
            request=request,
        )
        return Response(
            {"ok": True, "pending": _serialize_deletion_request(req)},
            status=status.HTTP_201_CREATED,
        )


def _serialize_deletion_request(req) -> dict:
    """Sérialisation interne — partagée entre vues user et admin."""
    return {
        "id": req.id,
        "user_id": req.user_id,
        "username": req.user.get_username() if req.user else None,
        "user_reason": req.user_reason,
        "status": req.status,
        "admin_comment": req.admin_comment,
        "decided_by_id": req.decided_by_id,
        "decided_by_username": (
            req.decided_by.get_username() if req.decided_by else None
        ),
        "created_at": req.created_at.isoformat(),
        "decided_at": req.decided_at.isoformat() if req.decided_at else None,
    }


class MeConsentAcceptInitialView(APIView):
    """POST /api/me/consent/accept-initial/ — acceptation initiale des 3 consentements.

    Appelé une seule fois à la première connexion. Enregistre 3 ConsentLog
    (GPS+STORAGE+PRIVACY_POLICY à granted=True) et passe must_accept_consent=False.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from services.audit import log_admin_action
        user = request.user
        if not user.must_accept_consent:
            return Response({"ok": True, "already_done": True})

        for kind in ("GPS", "STORAGE", "PRIVACY_POLICY"):
            ConsentLog.objects.create(
                user=user, kind=kind, granted=True,
                policy_version=PRIVACY_POLICY_VERSION if kind == "PRIVACY_POLICY" else "",
                ip_address=_client_ip(request),
                user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:300],
            )
        user.must_accept_consent = False
        user.save(update_fields=["must_accept_consent"])

        log_admin_action(
            actor=user, action=AdminAuditLog.Action.CONSENT_INITIAL_ACCEPTED,
            target_user=user, object_type="initial_consent", request=request,
        )
        return Response({"ok": True})


class MeConsentWithdrawalView(APIView):
    """GET /api/me/consent-withdrawal/ — liste des demandes de retrait en cours.
    POST /api/me/consent-withdrawal/ — soumet une demande {kind, reason}.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        requests_qs = ConsentWithdrawalRequest.objects.filter(
            user=request.user, status=ConsentWithdrawalRequest.Status.PENDING
        )
        return Response({
            "pending": [_serialize_withdrawal_request(r) for r in requests_qs]
        })

    def post(self, request):
        from services.audit import log_admin_action
        kind = request.data.get("kind")
        if kind not in ("GPS", "STORAGE", "PRIVACY_POLICY"):
            return Response({"error": "INVALID_KIND"}, status=status.HTTP_400_BAD_REQUEST)
        reason = (request.data.get("reason") or "")[:1000]

        existing = ConsentWithdrawalRequest.objects.filter(
            user=request.user, kind=kind, status=ConsentWithdrawalRequest.Status.PENDING
        ).first()
        if existing:
            return Response(
                {"error": "ALREADY_PENDING", "request": _serialize_withdrawal_request(existing)},
                status=status.HTTP_409_CONFLICT,
            )

        req = ConsentWithdrawalRequest.objects.create(
            user=request.user, kind=kind, user_reason=reason,
        )
        log_admin_action(
            actor=request.user, action=AdminAuditLog.Action.CONSENT_WITHDRAWAL_CREATED,
            target_user=request.user, object_type="ConsentWithdrawalRequest",
            object_id=str(req.pk), request=request,
        )
        return Response(
            {"ok": True, "request": _serialize_withdrawal_request(req)},
            status=status.HTTP_201_CREATED,
        )


def _serialize_withdrawal_request(req) -> dict:
    return {
        "id": req.pk,
        "kind": req.kind,
        "status": req.status,
        "user_reason": req.user_reason,
        "admin_comment": req.admin_comment,
        "created_at": req.created_at,
        "decided_at": req.decided_at,
    }


# ── Profil utilisateur (édition par l'employé lui-même) ────────────────

class MeProfileView(APIView):
    """GET/PATCH /api/me/profile/ — édition par l'employé de ses champs personnels.

    Champs éditables directement : email (pour notifications + récupération mdp),
    first_name, last_name.

    NON éditables ici (workflow d'approbation séparé) :
      - home_lat / home_lon → HomeAddressChangeRequest
      - password            → MeChangePasswordView (nécessite ancien mdp)
      - is_manager / quotas → admin uniquement
    """
    permission_classes = [IsAuthenticated]

    EDITABLE_FIELDS = {"email", "first_name", "last_name"}

    def get(self, request):
        u = request.user
        # Demande de changement d'adresse en attente (pour affichage badge UI).
        pending_addr = (
            HomeAddressChangeRequest.objects
            .filter(user=u, status=HomeAddressChangeRequest.Status.PENDING)
            .first()
        )
        return Response({
            "username": u.username,
            "email": u.email or "",
            "first_name": u.first_name or "",
            "last_name": u.last_name or "",
            # Les coords brutes restent disponibles pour le composant carte
            # (qui sait gérer une position initiale), mais l'UI affiche
            # uniquement `home_address_label` à l'utilisateur.
            "home_lat": float(u.home_lat) if u.home_lat is not None else None,
            "home_lon": float(u.home_lon) if u.home_lon is not None else None,
            "home_address_label": u.home_address_label or "",
            "has_home_address": u.has_home_address,
            "pending_home_address_change": _serialize_home_address_request(pending_addr) if pending_addr else None,
        })

    def patch(self, request):
        u = request.user
        updated = []
        for key, value in request.data.items():
            if key not in self.EDITABLE_FIELDS:
                continue
            # Validation minimaliste sur l'email.
            if key == "email":
                value = (value or "").strip()
                if value and "@" not in value:
                    return Response(
                        {"error": "INVALID_EMAIL",
                         "detail": "Adresse email invalide."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            setattr(u, key, value)
            updated.append(key)
        if updated:
            u.save(update_fields=updated)
        return Response({"ok": True, "updated_fields": updated})


class MeChangePasswordView(APIView):
    """POST /api/me/change-password/ — auto-changement du mot de passe.

    Exige l'ancien mot de passe (anti-hijack si quelqu'un a juste un JWT).
    Body : { old_password, new_password }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        user = request.user
        old = request.data.get("old_password") or ""
        new = request.data.get("new_password") or ""

        if not user.check_password(old):
            return Response(
                {"error": "WRONG_OLD_PASSWORD",
                 "detail": "Ancien mot de passe incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(new, user=user)
        except DjangoValidationError as e:
            return Response(
                {"error": "WEAK_PASSWORD", "detail": " ".join(e.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(new)
        user.save(update_fields=["password"])
        return Response({"ok": True})


class MeHomeAddressRequestView(APIView):
    """GET/POST /api/me/home-address-request/ — demande RH de changement d'adresse.

    Pattern identique à MeDeletionRequestView / MeConsentWithdrawalView.

    GET  → demande PENDING active, ou null
    POST → soumet une nouvelle demande {new_home_lat, new_home_lon, new_address_label, reason}
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        active = (
            HomeAddressChangeRequest.objects
            .filter(user=request.user, status=HomeAddressChangeRequest.Status.PENDING)
            .first()
        )
        return Response({
            "pending": _serialize_home_address_request(active) if active else None,
        })

    def post(self, request):
        from services.audit import log_admin_action

        lat = request.data.get("new_home_lat")
        lon = request.data.get("new_home_lon")
        if lat is None or lon is None:
            return Response(
                {"error": "MISSING_COORDS",
                 "detail": "Les coordonnées (lat, lon) sont requises."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            lat = float(lat)
            lon = float(lon)
        except (TypeError, ValueError):
            return Response(
                {"error": "INVALID_COORDS",
                 "detail": "Coordonnées non numériques."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return Response(
                {"error": "OUT_OF_RANGE",
                 "detail": "Latitude/longitude hors bornes."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = HomeAddressChangeRequest.objects.filter(
            user=request.user, status=HomeAddressChangeRequest.Status.PENDING,
        ).first()
        if existing:
            return Response(
                {"error": "ALREADY_PENDING",
                 "detail": "Une demande de changement d'adresse est déjà en attente.",
                 "request": _serialize_home_address_request(existing)},
                status=status.HTTP_409_CONFLICT,
            )

        req = HomeAddressChangeRequest.objects.create(
            user=request.user,
            new_home_lat=lat, new_home_lon=lon,
            new_address_label=(request.data.get("new_address_label") or "")[:300],
            user_reason=(request.data.get("reason") or "")[:1000],
        )
        # Auto-approbation pour les superusers (admin général : peut tout
        # faire, y compris s'auto-approuver). Le signal post_save sur
        # HomeAddressChangeRequest applique le changement.
        if request.user.is_superuser:
            req.status = HomeAddressChangeRequest.Status.APPROVED
            req.decided_by = request.user
            req.admin_comment = "Auto-approuvé (admin général)"
            req.decided_at = timezone.now()
            req.save()
        log_admin_action(
            actor=request.user, action=AdminAuditLog.Action.USER_UPDATE,
            target_user=request.user,
            object_type="HomeAddressChangeRequest", object_id=str(req.pk),
            details={
                "workflow": "home_address_request_created",
                "auto_approved": request.user.is_superuser,
            },
            request=request,
        )
        return Response(
            {"ok": True, "request": _serialize_home_address_request(req)},
            status=status.HTTP_201_CREATED,
        )


def _serialize_home_address_request(req) -> dict:
    return {
        "id": req.pk,
        "new_home_lat": float(req.new_home_lat),
        "new_home_lon": float(req.new_home_lon),
        "new_address_label": req.new_address_label,
        "user_reason": req.user_reason,
        "status": req.status,
        "admin_comment": req.admin_comment,
        "created_at": req.created_at,
        "decided_at": req.decided_at,
    }


class MeHolidaysView(APIView):
    """GET /api/me/holidays/?start=YYYY-MM-DD&end=YYYY-MM-DD — holidays of the user's home_site."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date as date_type
        user = request.user
        if not user.home_site_id:
            return Response([])
        raw_s = request.query_params.get("start")
        raw_e = request.query_params.get("end")
        qs = SiteHoliday.objects.filter(site_id=user.home_site_id)
        if raw_s and raw_e:
            try:
                qs = qs.filter(
                    date__gte=date_type.fromisoformat(raw_s),
                    date__lte=date_type.fromisoformat(raw_e),
                )
            except ValueError:
                return Response({"error": "INVALID_RANGE"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(SiteHolidaySerializer(qs.order_by("date"), many=True).data)


class MeSummaryView(APIView):
    """GET /api/me/summary/ — dashboard payload for the authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from services.sessions import worked_minutes_on_day
        user = request.user
        today = timezone.localdate()
        # Calcul live : inclut la session ouverte (cap = now), applique
        # la déduction automatique de pause. Le frontend interpole entre
        # 2 polls via un tick local (cf. useLiveWorkedMinutes).
        worked_minutes = worked_minutes_on_day(
            user, today, apply_policy=True, include_open=True,
        )
        open_session = (
            ClockSession.objects
            .filter(user=user, clock_out__isnull=True)
            .order_by("-clock_in")
            .first()
        )
        # Pour le tick live côté front : on expose le clock_in_rounded de
        # la session ouverte UNIQUEMENT si elle est démarrée aujourd'hui
        # (les sessions de la veille déclenchent la garde OPEN_SESSION_PREVIOUS_DAY,
        # donc impossible en pratique mais on est défensif).
        open_session_clock_in_rounded = None
        if open_session and open_session.clock_in.date() == today:
            open_session_clock_in_rounded = (
                open_session.clock_in_rounded or open_session.clock_in
            )
        home_site = None
        if user.home_site_id:
            s = user.home_site
            home_site = {
                "id": s.id,
                "name": s.name,
                "latitude": float(s.latitude),
                "longitude": float(s.longitude),
                "gps_radius_meters": s.gps_radius_meters,
            }
        policy = WorkTimePolicy.load()
        return Response({
            "username": user.get_username(),
            "is_manager": user.is_manager,
            "is_mission_manager": user.is_mission_manager,
            "is_superuser": user.is_superuser,
            "exempt_from_clocking": user.exempt_from_clocking,
            "must_accept_consent": user.must_accept_consent,
            "weekly_target_hours": user.weekly_target_hours,
            "daily_target_hours": user.daily_target_hours,
            "overtime_balance_hours": user.overtime_balance,
            "vacation_quota": user.vacation_quota,
            "vacation_used": user.vacation_used,
            "vacation_remaining": Decimal(user.vacation_quota) - user.vacation_used,
            "pending_absences_count": _count_pending_absences(user),
            "pending_missions_count": _count_pending_missions(user),
            "home_site": home_site,
            "today": {
                "worked_minutes": worked_minutes,
                "target_minutes": int(user.daily_target_hours * 60),
                "has_open_session": open_session is not None,
                # Timestamp ISO du clock_in arrondi de la session en cours,
                # pour permettre au front de ticker le compteur live.
                "open_session_clock_in_rounded": (
                    open_session_clock_in_rounded.isoformat()
                    if open_session_clock_in_rounded else None
                ),
            },
            "policy": {
                "auto_deduct_break": policy.auto_deduct_break,
                "break_trigger_minutes": policy.break_trigger_minutes,
                "break_duration_minutes": policy.break_duration_minutes,
                "paid_break_minutes": policy.paid_break_minutes,
                "daily_min_minutes": policy.daily_min_minutes,
                "daily_max_minutes": policy.daily_max_minutes,
                "eve_holiday_reduced_minutes": policy.eve_holiday_reduced_minutes,
                "month_lock_day": policy.month_lock_day,
            },
        })


class AdminAuditLogView(APIView):
    """GET /api/admin/audit/?action=&target_user=&start=&end=&limit=

    Liste paginée du journal d'audit (Art. 12 LPD). Superuser uniquement.
    Append-only — aucune méthode d'écriture exposée ici.
    """

    permission_classes = [IsSuperUser]

    def get(self, request):
        from datetime import date as date_type
        qs = AdminAuditLog.objects.select_related("actor", "target_user").order_by("-created_at")
        action = request.query_params.get("action")
        if action:
            qs = qs.filter(action=action)
        target = request.query_params.get("target_user")
        if target:
            qs = qs.filter(target_user_id=target)
        actor = request.query_params.get("actor")
        if actor:
            qs = qs.filter(actor_id=actor)
        start = request.query_params.get("start")
        if start:
            try:
                qs = qs.filter(created_at__date__gte=date_type.fromisoformat(start))
            except ValueError:
                pass
        end = request.query_params.get("end")
        if end:
            try:
                qs = qs.filter(created_at__date__lte=date_type.fromisoformat(end))
            except ValueError:
                pass
        try:
            limit = max(1, min(500, int(request.query_params.get("limit", 100))))
        except (TypeError, ValueError):
            limit = 100
        rows = qs[:limit]
        return Response({
            "count": len(rows),
            "limit": limit,
            "results": [
                {
                    "id": r.id,
                    "action": r.action,
                    "actor_id": r.actor_id,
                    "actor_username": r.actor.get_username() if r.actor else None,
                    "target_user_id": r.target_user_id,
                    "target_username": r.target_user.get_username() if r.target_user else None,
                    "object_type": r.object_type,
                    "object_id": r.object_id,
                    "details": r.details,
                    "ip_address": r.ip_address,
                    "created_at": r.created_at,
                }
                for r in rows
            ],
            "actions_choices": [
                {"value": v, "label": l} for v, l in AdminAuditLog.Action.choices
            ],
        })


class AdminUserViewSet(viewsets.ModelViewSet):
    """CRUD on UserProfile — superuser only (create / delete / edit collaborators)."""

    queryset = UserProfile.objects.all().order_by("username")
    serializer_class = AdminUserSerializer
    permission_classes = [IsSuperUser]

    def perform_create(self, serializer):
        from services.audit import log_admin_action
        instance = serializer.save()
        log_admin_action(
            actor=self.request.user, action=AdminAuditLog.Action.USER_CREATE,
            target_user=instance, request=self.request,
        )

    def perform_update(self, serializer):
        from services.audit import log_admin_action
        prev_is_manager = serializer.instance.is_manager
        # Snapshot AVANT save : on a besoin des anciennes valeurs pour
        # détecter un changement d'adresse / de site et déclencher le
        # recalcul auto du trajet standard.
        prev_lat = serializer.instance.home_lat
        prev_lon = serializer.instance.home_lon
        prev_site_id = serializer.instance.home_site_id
        # Si l'admin a explicitement saisi `standard_commute_minutes` dans
        # cette requête, on respecte sa valeur (override manuel) et on
        # NE déclenche PAS le recalcul auto pour cette save.
        admin_override = "standard_commute_minutes" in self.request.data

        instance = serializer.save()

        address_or_site_changed = (
            instance.home_lat != prev_lat
            or instance.home_lon != prev_lon
            or instance.home_site_id != prev_site_id
        )
        if address_or_site_changed and not admin_override:
            self._recompute_commute(instance)

        action = (
            AdminAuditLog.Action.ROLE_CHANGE
            if instance.is_manager != prev_is_manager
            else AdminAuditLog.Action.USER_UPDATE
        )
        log_admin_action(
            actor=self.request.user, action=action,
            target_user=instance,
            details={"is_manager": instance.is_manager} if action == AdminAuditLog.Action.ROLE_CHANGE else {},
            request=self.request,
        )

    @staticmethod
    def _recompute_commute(user) -> None:
        """Calcule le trajet standard via ORS, sauvegarde si valeur trouvée.
        Fail-open : si ORS rate, on ne touche pas l'ancienne valeur."""
        from services.routing import compute_commute_minutes
        minutes = compute_commute_minutes(user)
        if minutes is not None:
            user.standard_commute_minutes = minutes
            user.save(update_fields=["standard_commute_minutes"])

    def perform_destroy(self, instance):
        # Anonymisation au lieu de delete brut.
        from services.audit import anonymize_user, log_admin_action
        log_admin_action(
            actor=self.request.user, action=AdminAuditLog.Action.USER_DELETE,
            target_user=instance, details={"reason": "admin_action"},
            request=self.request,
        )
        anonymize_user(instance)


class AdminDeletionRequestListView(APIView):
    """GET /api/admin/deletion-requests/[?status=PENDING] — superuser uniquement.

    Vue d'inbox RH : toutes les demandes de suppression de compte soumises
    par les collaborateurs. Filtre `status` optionnel (par défaut : tout).
    """

    permission_classes = [IsSuperUser]

    def get(self, request):
        qs = DataDeletionRequest.objects.select_related("user", "decided_by")
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        rows = qs[:200]
        return Response({
            "count": len(rows),
            "results": [_serialize_deletion_request(r) for r in rows],
        })


class AdminDeletionRequestDecisionView(APIView):
    """PATCH /api/admin/deletion-requests/{id}/ — superuser approuve / refuse.

    Body : `{"decision": "approve"|"reject", "comment": "..."}`

    - approve → exécute `anonymize_user()` sur le compte du collaborateur,
      passe la demande en APPROVED, écrit l'audit log.
    - reject → passe la demande en REJECTED avec le commentaire admin
      (typiquement : "départ en cours, RH gère via SIRH" ou autre).

    Une demande ne peut être traitée qu'une fois (status doit être PENDING).
    """

    permission_classes = [IsSuperUser]

    def patch(self, request, pk: int):
        from services.audit import anonymize_user, log_admin_action

        req = generics.get_object_or_404(DataDeletionRequest, pk=pk)
        if req.status != DataDeletionRequest.Status.PENDING:
            return Response(
                {"error": "ALREADY_DECIDED", "current_status": req.status},
                status=status.HTTP_409_CONFLICT,
            )
        decision = (request.data.get("decision") or "").lower()
        comment = str(request.data.get("comment") or "")[:1000]
        if decision not in ("approve", "reject"):
            return Response(
                {"error": "INVALID_DECISION",
                 "hint": "Expected decision='approve' or 'reject'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Garde-fou : on ne s'auto-approuve pas. Un superuser peut traiter
        # toutes les demandes SAUF la sienne (ce qui de toute façon ne peut
        # pas exister puisqu'on bloque la création par un superuser).
        if req.user_id == request.user.id:
            return Response(
                {"error": "CANNOT_SELF_DECIDE"},
                status=status.HTTP_403_FORBIDDEN,
            )

        target = req.user
        if decision == "approve":
            req.status = DataDeletionRequest.Status.APPROVED
            req.admin_comment = comment
            req.decided_by = request.user
            req.decided_at = timezone.now()
            req.save()
            log_admin_action(
                actor=request.user,
                action=AdminAuditLog.Action.DELETION_REQUEST_APPROVED,
                target_user=target, object_type="DataDeletionRequest",
                object_id=req.id, details={"comment": comment},
                request=request,
            )
            # Anonymisation maintenant — pas avant (ne pas écraser FK
            # `decided_by` ou casser les contraintes).
            anonymize_user(target)
        else:  # reject
            req.status = DataDeletionRequest.Status.REJECTED
            req.admin_comment = comment
            req.decided_by = request.user
            req.decided_at = timezone.now()
            req.save()
            log_admin_action(
                actor=request.user,
                action=AdminAuditLog.Action.DELETION_REQUEST_REJECTED,
                target_user=target, object_type="DataDeletionRequest",
                object_id=req.id, details={"comment": comment},
                request=request,
            )

        req.refresh_from_db()
        return Response(_serialize_deletion_request(req))


class AdminConsentWithdrawalListView(APIView):
    """GET /api/admin/consent-withdrawals/ — superuser uniquement.

    Vue d'inbox RH : toutes les demandes de retrait de consentement soumises
    par les collaborateurs. Filtre `status` optionnel (par défaut : tout).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response(status=status.HTTP_403_FORBIDDEN)
        status_filter = request.query_params.get("status")
        qs = ConsentWithdrawalRequest.objects.select_related("user", "decided_by").order_by("-created_at")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({"results": [_serialize_withdrawal_request_admin(r) for r in qs]})


class AdminConsentWithdrawalDecideView(APIView):
    """PATCH /api/admin/consent-withdrawals/{id}/ — approve ou reject."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        from django.shortcuts import get_object_or_404
        from services.audit import log_admin_action
        if not request.user.is_superuser:
            return Response(status=status.HTTP_403_FORBIDDEN)
        req = get_object_or_404(ConsentWithdrawalRequest, pk=pk)
        if req.status != ConsentWithdrawalRequest.Status.PENDING:
            return Response({"error": "NOT_PENDING"}, status=status.HTTP_409_CONFLICT)

        decision = request.data.get("decision")
        comment = (request.data.get("comment") or "")[:500]

        if decision == "APPROVE":
            # Créer le ConsentLog inverse AVANT le save : le signal
            # post_save sur ConsentWithdrawalRequest est idempotent
            # (il ne crée rien si le dernier log est déjà granted=False),
            # mais ainsi le log porte IP et user_agent admin pour audit.
            ConsentLog.objects.create(
                user=req.user, kind=req.kind, granted=False,
                policy_version=PRIVACY_POLICY_VERSION if req.kind == "PRIVACY_POLICY" else "",
                ip_address=_client_ip(request),
                user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:300],
            )
            req.status = ConsentWithdrawalRequest.Status.APPROVED
            req.decided_by = request.user
            req.admin_comment = comment
            req.decided_at = timezone.now()
            req.save()
            log_admin_action(
                actor=request.user, action=AdminAuditLog.Action.CONSENT_WITHDRAWAL_APPROVED,
                target_user=req.user, object_type="ConsentWithdrawalRequest",
                object_id=str(req.pk), request=request,
            )
        elif decision == "REJECT":
            req.status = ConsentWithdrawalRequest.Status.REJECTED
            req.decided_by = request.user
            req.admin_comment = comment
            req.decided_at = timezone.now()
            req.save()
            log_admin_action(
                actor=request.user, action=AdminAuditLog.Action.CONSENT_WITHDRAWAL_REJECTED,
                target_user=req.user, object_type="ConsentWithdrawalRequest",
                object_id=str(req.pk), request=request,
            )
        else:
            return Response({"error": "INVALID_DECISION"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"ok": True, "request": _serialize_withdrawal_request(req)})


def _serialize_withdrawal_request_admin(req) -> dict:
    d = _serialize_withdrawal_request(req)
    d["user"] = {
        "id": req.user_id,
        "username": req.user.username,
        "full_name": req.user.get_full_name(),
        "email": req.user.email,
    }
    if req.decided_by:
        d["decided_by"] = req.decided_by.get_full_name() or req.decided_by.username
    return d


# ── Admin : gestion des demandes de changement d'adresse ───────────────

class AdminHomeAddressRequestListView(APIView):
    """GET /api/admin/home-address-requests/?status=PENDING — superuser only."""
    permission_classes = [IsSuperUser]

    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = HomeAddressChangeRequest.objects.select_related("user", "decided_by").order_by("-created_at")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({
            "results": [_serialize_home_address_request_admin(r) for r in qs],
        })


class AdminHomeAddressRequestDecideView(APIView):
    """PATCH /api/admin/home-address-requests/{id}/ — approuver ou refuser.

    Body : { decision: "APPROVE" | "REJECT", comment?: "" }
    L'application effective des coordonnées est faite par le signal post_save.
    """
    permission_classes = [IsSuperUser]

    def patch(self, request, pk):
        from django.shortcuts import get_object_or_404
        from services.audit import log_admin_action

        req = get_object_or_404(HomeAddressChangeRequest, pk=pk)
        if req.status != HomeAddressChangeRequest.Status.PENDING:
            return Response({"error": "NOT_PENDING"}, status=status.HTTP_409_CONFLICT)

        decision = request.data.get("decision")
        comment = (request.data.get("comment") or "")[:500]

        if decision == "APPROVE":
            req.status = HomeAddressChangeRequest.Status.APPROVED
        elif decision == "REJECT":
            req.status = HomeAddressChangeRequest.Status.REJECTED
        else:
            return Response({"error": "INVALID_DECISION"}, status=status.HTTP_400_BAD_REQUEST)

        req.decided_by = request.user
        req.admin_comment = comment
        req.decided_at = timezone.now()
        req.save()  # signal post_save applique les coords si APPROVED

        log_admin_action(
            actor=request.user, action=AdminAuditLog.Action.USER_UPDATE,
            target_user=req.user, object_type="HomeAddressChangeRequest",
            object_id=str(req.pk),
            details={"workflow": "home_address_decision", "decision": decision},
            request=request,
        )
        return Response({"ok": True, "request": _serialize_home_address_request_admin(req)})


def _serialize_home_address_request_admin(req) -> dict:
    d = _serialize_home_address_request(req)
    d["user"] = {
        "id": req.user_id,
        "username": req.user.username,
        "full_name": req.user.get_full_name(),
        "email": req.user.email,
    }
    if req.decided_by:
        d["decided_by"] = req.decided_by.get_full_name() or req.decided_by.username
    return d


# ── Promote / demote superuser via clé secrète ────────────────────────

class AdminPromoteSuperuserView(APIView):
    """POST /api/admin/users/{id}/promote-superuser/ — promotion ADMIN GÉNÉRAL.

    Garde-fou : exige la clé secrète SUPERUSER_PROMOTION_KEY (env var,
    typiquement 15 chiffres). Sans la bonne clé → 403, et tentative
    enregistrée en audit log.

    L'appelant DOIT déjà être superuser (sinon il ne pourrait pas accéder
    à l'espace admin). Cela permet à un superuser de promouvoir un autre
    user sans pouvoir le faire en aveugle.

    Pour DEMOTE : POST avec body {demote: true, key: "..."}.
    """
    permission_classes = [IsSuperUser]

    def post(self, request, pk):
        from django.conf import settings
        from django.shortcuts import get_object_or_404
        from services.audit import log_admin_action

        configured_key = getattr(settings, "SUPERUSER_PROMOTION_KEY", "")
        if not configured_key:
            return Response(
                {"error": "FEATURE_DISABLED",
                 "detail": "La promotion superuser n'est pas configurée (variable SUPERUSER_PROMOTION_KEY)."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        provided_key = (request.data.get("key") or "").strip()
        demote = bool(request.data.get("demote", False))

        target = get_object_or_404(UserProfile, pk=pk)

        if provided_key != configured_key:
            # Trace dans l'audit pour détection abus.
            log_admin_action(
                actor=request.user, action=AdminAuditLog.Action.ROLE_CHANGE,
                target_user=target, object_type="superuser_promotion",
                details={"outcome": "WRONG_KEY", "demote": demote},
                request=request,
            )
            return Response(
                {"error": "INVALID_KEY",
                 "detail": "Clé secrète incorrecte."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if demote:
            if target.id == request.user.id:
                return Response(
                    {"error": "CANNOT_DEMOTE_SELF",
                     "detail": "Vous ne pouvez pas vous démettre vous-même."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target.is_superuser = False
            target.is_staff = False
        else:
            target.is_superuser = True
            target.is_staff = True
        target.save(update_fields=["is_superuser", "is_staff"])

        log_admin_action(
            actor=request.user, action=AdminAuditLog.Action.ROLE_CHANGE,
            target_user=target, object_type="superuser_promotion",
            details={
                "outcome": "OK",
                "is_superuser_after": target.is_superuser,
                "demote": demote,
            },
            request=request,
        )
        return Response({
            "ok": True,
            "user_id": target.id,
            "is_superuser": target.is_superuser,
        })


# ── Helpers ─────────────────────────────────────────────────────────────────

def _count_pending_absences(user: UserProfile) -> int:
    try:
        from apps.absences.models import AbsenceRequest
        return AbsenceRequest.objects.filter(user=user, status="PENDING").count()
    except Exception:
        return 0


def _count_pending_missions(user: UserProfile) -> int:
    try:
        from apps.clocking.models import Mission
        return Mission.objects.filter(user=user, status="PENDING").count()
    except Exception:
        return 0


# ── WorkTimePolicy & MajorationRule admin views ──────────────────────────────

class WorkTimePolicyView(APIView):
    """GET / PUT / PATCH /api/admin/work-time-policy/ — singleton (superuser only)."""

    permission_classes = [IsSuperUser]

    def get(self, request):
        return Response(WorkTimePolicySerializer(WorkTimePolicy.load()).data)

    def put(self, request):
        policy = WorkTimePolicy.load()
        ser = WorkTimePolicySerializer(policy, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def patch(self, request):
        policy = WorkTimePolicy.load()
        ser = WorkTimePolicySerializer(policy, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class MajorationRuleListView(generics.ListCreateAPIView):
    """GET /api/admin/majoration-rules/ + POST (superuser only)."""

    queryset = MajorationRule.objects.all()
    serializer_class = MajorationRuleSerializer
    permission_classes = [IsSuperUser]


class MajorationRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET / PUT / PATCH / DELETE /api/admin/majoration-rules/{id}/ (superuser only)."""

    queryset = MajorationRule.objects.all()
    serializer_class = MajorationRuleSerializer
    permission_classes = [IsSuperUser]
