from django.contrib import admin
from django.urls import include, path

from apps.users.urls import me_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.users.urls")),
    path("api/me/", include(me_urlpatterns)),
    path("api/clock/", include("apps.clocking.urls")),
    path("api/missions/", include("apps.missions.urls")),
    path("api/absences/", include("apps.absences.urls")),
    path("api/manager/", include("core.manager_urls")),
    path("api/admin/", include("core.admin_urls")),
]
