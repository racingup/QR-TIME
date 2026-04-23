from django.contrib import admin

from apps.clocking.models import Alert, ClockSession, FixedTimeSlot


@admin.register(ClockSession)
class ClockSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "session_type", "clock_in", "clock_out", "site", "mission", "is_forgotten")
    list_filter = ("session_type", "is_forgotten", "site")
    search_fields = ("user__username",)
    raw_id_fields = ("user", "site", "mission")


@admin.register(FixedTimeSlot)
class FixedTimeSlotAdmin(admin.ModelAdmin):
    list_display = ("name", "start_time", "end_time", "is_active")
    list_filter = ("is_active",)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("kind", "user", "session", "created_at", "resolved_at")
    list_filter = ("kind",)
    search_fields = ("user__username",)
    raw_id_fields = ("user", "session")
