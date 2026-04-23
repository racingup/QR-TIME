from django.urls import path
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)

from apps.users.throttles import LoginIPThrottle, LoginUserThrottle
from apps.users.views import (
    MeCompanyView,
    MeConsentView,
    MeDeletionRequestView,
    MeExportView,
    MeHolidaysView,
    MeSummaryView,
)


class ThrottledLoginView(TokenObtainPairView):
    """Login JWT protégé contre le credential-stuffing.

    Deux throttles additionnés : par IP (LoginIPThrottle) et par identifiant
    ciblé (LoginUserThrottle). Retourne 429 si l'un des deux sature.
    """

    throttle_classes = [LoginIPThrottle, LoginUserThrottle]


urlpatterns = [
    path("login/", ThrottledLoginView.as_view(), name="auth-login"),
    path("refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("logout/", TokenBlacklistView.as_view(), name="auth-logout"),
]

me_urlpatterns = [
    path("summary/", MeSummaryView.as_view(), name="me-summary"),
    path("holidays/", MeHolidaysView.as_view(), name="me-holidays"),
    path("consent/", MeConsentView.as_view(), name="me-consent"),
    path("export/", MeExportView.as_view(), name="me-export"),
    # Workflow LPD : l'employé soumet une *demande* de suppression. L'ancienne
    # route /delete-account/ est conservée comme alias pour les clients déjà
    # déployés mais pointe vers la nouvelle vue (création de demande).
    path("deletion-request/", MeDeletionRequestView.as_view(), name="me-deletion-request"),
    path("delete-account/", MeDeletionRequestView.as_view(), name="me-delete"),
    path("company/", MeCompanyView.as_view(), name="me-company"),
]
