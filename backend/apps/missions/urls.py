from django.urls import path

from apps.missions.views import (
    MissionApproveView,
    MissionCreateView,
    MissionQRView,
    MissionRejectView,
    MyMissionsView,
    PendingMissionsView,
)

urlpatterns = [
    path("", MissionCreateView.as_view(), name="mission-create"),
    path("my/", MyMissionsView.as_view(), name="mission-my"),
    path("pending/", PendingMissionsView.as_view(), name="mission-pending"),
    path("<int:pk>/approve/", MissionApproveView.as_view(), name="mission-approve"),
    path("<int:pk>/reject/", MissionRejectView.as_view(), name="mission-reject"),
    path("<int:pk>/qr/", MissionQRView.as_view(), name="mission-qr"),
]
