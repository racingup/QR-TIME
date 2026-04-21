from django.urls import path

from apps.absences.views import (
    AbsenceApproveView,
    AbsenceCreateView,
    MyAbsencesView,
    PendingAbsencesView,
)

urlpatterns = [
    path("", AbsenceCreateView.as_view(), name="absence-create"),
    path("my/", MyAbsencesView.as_view(), name="absence-my"),
    path("pending/", PendingAbsencesView.as_view(), name="absence-pending"),
    path("<int:pk>/approve/", AbsenceApproveView.as_view(), name="absence-approve"),
]
