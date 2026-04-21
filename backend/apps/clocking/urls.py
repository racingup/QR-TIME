from django.urls import path

from apps.clocking.views import ScanView, TodaySessionsView

urlpatterns = [
    path("scan/", ScanView.as_view(), name="clock-scan"),
    path("today/", TodaySessionsView.as_view(), name="clock-today"),
]
