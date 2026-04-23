from django.urls import path

from apps.missions.views import (
    AllMissionsView,
    MissionApproveView,
    MissionCreateView,
    MissionQRView,
    MissionRejectView,
    MissionUpdateView,
    MyMissionsView,
    PendingMissionsView,
)

urlpatterns = [
    path("", MissionCreateView.as_view(), name="mission-create"),
    path("my/", MyMissionsView.as_view(), name="mission-my"),
    path("all/", AllMissionsView.as_view(), name="mission-all"),
    path("pending/", PendingMissionsView.as_view(), name="mission-pending"),
    path("<int:pk>/", MissionUpdateView.as_view(), name="mission-update"),
    path("<int:pk>/approve/", MissionApproveView.as_view(), name="mission-approve"),
    path("<int:pk>/reject/", MissionRejectView.as_view(), name="mission-reject"),
    path("<int:pk>/qr/", MissionQRView.as_view(), name="mission-qr"),
]
