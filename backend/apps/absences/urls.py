from django.urls import path

from apps.absences.views import (
    AbsenceApproveView,
    AbsenceCancelView,
    AbsenceCreateView,
    AbsenceRejectView,
    AbsenceUpdateView,
    MyAbsencesView,
    PendingAbsencesView,
)

urlpatterns = [
    path("", AbsenceCreateView.as_view(), name="absence-create"),
    path("my/", MyAbsencesView.as_view(), name="absence-my"),
    path("pending/", PendingAbsencesView.as_view(), name="absence-pending"),
    path("<int:pk>/", AbsenceUpdateView.as_view(), name="absence-update"),
    path("<int:pk>/approve/", AbsenceApproveView.as_view(), name="absence-approve"),
    path("<int:pk>/reject/", AbsenceRejectView.as_view(), name="absence-reject"),
    path("<int:pk>/cancel/", AbsenceCancelView.as_view(), name="absence-cancel"),
]
