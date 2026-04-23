from django.contrib import admin

from apps.absences.models import AbsenceRequest


@admin.register(AbsenceRequest)
class AbsenceRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "absence_type", "date_start", "date_end", "status", "approved_by")
    list_filter = ("absence_type", "status")
    search_fields = ("user__username",)
    raw_id_fields = ("user", "approved_by")
