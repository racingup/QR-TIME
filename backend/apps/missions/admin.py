from django.contrib import admin

from apps.missions.models import Mission


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ("user", "mission_type", "date_start", "date_end", "status", "location_name", "approved_by")
    list_filter = ("mission_type", "status")
    search_fields = ("user__username", "location_name", "mission_number")
    raw_id_fields = ("user", "approved_by")
