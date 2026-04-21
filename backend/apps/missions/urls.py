from django.urls import path

from apps.missions.views import (
    MissionApproveView,
    MissionCreateView,
    MissionQRView,
    MissionRejectView,
)

urlpatterns = [
    path("", MissionCreateView.as_view(), name="mission-create"),
    path("<int:pk>/approve/", MissionApproveView.as_view(), name="mission-approve"),
    path("<int:pk>/reject/", MissionRejectView.as_view(), name="mission-reject"),
    path("<int:pk>/qr/", MissionQRView.as_view(), name="mission-qr"),
]
