from django.urls import path

from apps.absences.views import AbsenceApproveView, AbsenceCreateView

urlpatterns = [
    path("", AbsenceCreateView.as_view(), name="absence-create"),
    path("<int:pk>/approve/", AbsenceApproveView.as_view(), name="absence-approve"),
]
