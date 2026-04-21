"""Admin/manager-facing URL routes (mounted at /api/admin/)."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.clocking.views import FixedTimeSlotViewSet
from apps.users.views import AdminUserViewSet, SiteViewSet, ToleranceConfigView

router = DefaultRouter()
router.register(r"sites", SiteViewSet, basename="admin-site")
router.register(r"fixed-slots", FixedTimeSlotViewSet, basename="admin-fixed-slot")
router.register(r"users", AdminUserViewSet, basename="admin-user")

urlpatterns = [
    path("", include(router.urls)),
    path("tolerance/", ToleranceConfigView.as_view(), name="admin-tolerance"),
]
