"""Manager dashboard read endpoints (mounted at /api/manager/)."""
from django.urls import path

from apps.clocking.views import ManagerAlertsView, ManagerPresenceView

urlpatterns = [
    path("presence/", ManagerPresenceView.as_view(), name="manager-presence"),
    path("alerts/", ManagerAlertsView.as_view(), name="manager-alerts"),
]
