from django.urls import path

from apps.clocking.views import (
    ClockSessionUpdateView,
    DayDetailView,
    HistoryView,
    ManagerAlertsView,
    ManagerPresenceView,
    ManualClockSessionView,
    RegularizeSessionView,
    ScanView,
    TodaySessionsView,
)

urlpatterns = [
    path("scan/", ScanView.as_view(), name="clock-scan"),
    path("today/", TodaySessionsView.as_view(), name="clock-today"),
    path("day/", DayDetailView.as_view(), name="clock-day"),
    path("history/", HistoryView.as_view(), name="clock-history"),
    path("manual/", ManualClockSessionView.as_view(), name="clock-manual"),
    path("<int:pk>/regularize/", RegularizeSessionView.as_view(), name="clock-regularize"),
    path("<int:pk>/edit/", ClockSessionUpdateView.as_view(), name="clock-edit"),
]
