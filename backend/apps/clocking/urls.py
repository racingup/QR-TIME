from django.urls import path

from apps.clocking.views import (
    HistoryView,
    ManagerAlertsView,
    ManagerPresenceView,
    RegularizeSessionView,
    ScanView,
    TodaySessionsView,
)

urlpatterns = [
    path("scan/", ScanView.as_view(), name="clock-scan"),
    path("today/", TodaySessionsView.as_view(), name="clock-today"),
    path("history/", HistoryView.as_view(), name="clock-history"),
    path("<int:pk>/regularize/", RegularizeSessionView.as_view(), name="clock-regularize"),
]
