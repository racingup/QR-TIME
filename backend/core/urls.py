from django.conf import settings
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from django.utils import timezone

from apps.users.urls import me_urlpatterns
from apps.users.views import PublicBrandingView


def health(request):
    """Health endpoint pour load balancer / monitoring (uptimerobot, etc.).

    Vérifie que la DB répond. Pas d'authentification, pas de données sensibles.
    Retourne 503 si la base est injoignable — utile pour faire échouer un
    healthcheck Caddy/Docker plutôt qu'un timeout silencieux.
    """
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        return JsonResponse({"status": "ok", "time": timezone.now().isoformat()})
    except Exception:  # noqa: BLE001
        return JsonResponse({"status": "error"}, status=503)


urlpatterns = [
    path(settings.ADMIN_PATH, admin.site.urls),
    path("api/health/", health, name="health"),
    # Branding public (logo + couleurs) — accessible sans auth pour la
    # page de login. N'expose pas les infos sensibles (cf. PublicBrandingSerializer).
    path("api/branding/", PublicBrandingView.as_view(), name="public-branding"),
    path("api/auth/", include("apps.users.urls")),
    path("api/me/", include(me_urlpatterns)),
    path("api/clock/", include("apps.clocking.urls")),
    path("api/missions/", include("apps.missions.urls")),
    path("api/absences/", include("apps.absences.urls")),
    path("api/manager/", include("core.manager_urls")),
    path("api/admin/", include("core.admin_urls")),
]
