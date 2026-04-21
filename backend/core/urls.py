from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.users.urls")),
    path("api/clock/", include("apps.clocking.urls")),
    path("api/missions/", include("apps.missions.urls")),
    path("api/absences/", include("apps.absences.urls")),
]
