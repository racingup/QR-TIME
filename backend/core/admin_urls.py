"""Admin/manager-facing URL routes (mounted at /api/admin/)."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.clocking.views import FixedTimeSlotViewSet
from apps.users.views import (
    AdminAuditLogView,
    AdminDeletionRequestDecisionView,
    AdminDeletionRequestListView,
    AdminUserViewSet,
    CompanySettingsAdminView,
    MajorationRuleDetailView,
    MajorationRuleListView,
    SiteHolidayViewSet,
    SiteViewSet,
    ToleranceConfigView,
    WorkTimePolicyView,
)

router = DefaultRouter()
router.register(r"sites", SiteViewSet, basename="admin-site")
router.register(r"fixed-slots", FixedTimeSlotViewSet, basename="admin-fixed-slot")
router.register(r"holidays", SiteHolidayViewSet, basename="admin-holiday")
router.register(r"users", AdminUserViewSet, basename="admin-user")

urlpatterns = [
    path("", include(router.urls)),
    path("tolerance/", ToleranceConfigView.as_view(), name="admin-tolerance"),
    path(
        "company-settings/",
        CompanySettingsAdminView.as_view(), name="admin-company-settings",
    ),
    path("audit/", AdminAuditLogView.as_view(), name="admin-audit"),
    path(
        "deletion-requests/",
        AdminDeletionRequestListView.as_view(), name="admin-deletion-requests",
    ),
    path(
        "deletion-requests/<int:pk>/",
        AdminDeletionRequestDecisionView.as_view(), name="admin-deletion-request-decide",
    ),
    path("work-time-policy/", WorkTimePolicyView.as_view(), name="admin-work-time-policy"),
    path("majoration-rules/", MajorationRuleListView.as_view(), name="admin-majoration-rules"),
    path("majoration-rules/<int:pk>/", MajorationRuleDetailView.as_view(), name="admin-majoration-rule-detail"),
]
