"""Manager dashboard read endpoints (mounted at /api/manager/)."""
from django.urls import path

from apps.clocking.views import (
    ManagerAbsentView,
    ManagerAlertsView,
    ManagerPresenceView,
    ManagerTeamCalendarView,
    ManagerTeamView,
    MonthlyReportView,
    UserMonthlyDetailView,
)

urlpatterns = [
    path("presence/", ManagerPresenceView.as_view(), name="manager-presence"),
    path("absent-today/", ManagerAbsentView.as_view(), name="manager-absent"),
    path("alerts/", ManagerAlertsView.as_view(), name="manager-alerts"),
    path("team/", ManagerTeamView.as_view(), name="manager-team"),
    path("team-calendar/", ManagerTeamCalendarView.as_view(), name="manager-team-calendar"),
    path("report/", MonthlyReportView.as_view(), name="manager-report"),
    path("report/<int:user_id>/", UserMonthlyDetailView.as_view(), name="manager-report-user"),
]
