from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from apps.users.models import (
    AdminAuditLog,
    ConsentLog,
    ConsentWithdrawalRequest,
    Site,
    SiteHoliday,
    SiteQRAudit,
    ToleranceConfig,
    UserProfile,
)


@admin.register(UserProfile)
class UserProfileAdmin(UserAdmin):
    list_display = ("username", "email", "is_manager", "is_mission_manager", "is_superuser", "home_site", "is_active")
    list_filter = ("is_manager", "is_mission_manager", "is_superuser", "is_active", "home_site")
    search_fields = ("username", "email", "first_name", "last_name")
    fieldsets = UserAdmin.fieldsets + (
        ("QRTime", {"fields": ("weekly_target_hours", "vacation_quota", "vacation_used", "overtime_balance", "is_manager", "is_mission_manager", "home_site")}),
    )


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ("name", "latitude", "longitude", "gps_radius_meters", "token_updated_at")
    search_fields = ("name",)
    readonly_fields = ("qr_code_token", "token_updated_at")


@admin.register(SiteHoliday)
class SiteHolidayAdmin(admin.ModelAdmin):
    list_display = ("site", "date", "name")
    list_filter = ("site",)
    search_fields = ("name",)


@admin.register(ToleranceConfig)
class ToleranceConfigAdmin(admin.ModelAdmin):
    list_display = ("tolerance_minutes", "rounding_direction")


@admin.register(ConsentLog)
class ConsentLogAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "granted", "created_at")
    list_filter = ("kind", "granted")
    search_fields = ("user__username",)
    readonly_fields = ("user", "kind", "granted", "policy_version", "ip_address", "user_agent", "created_at")


@admin.register(ConsentWithdrawalRequest)
class ConsentWithdrawalRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "status", "created_at", "decided_by", "decided_at")
    list_filter = ("kind", "status")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("user", "kind", "user_reason", "created_at")
    fields = ("user", "kind", "user_reason", "status", "decided_by", "admin_comment", "decided_at", "created_at")


@admin.register(AdminAuditLog)
class AdminAuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "actor", "target_user", "created_at", "ip_address")
    list_filter = ("action",)
    search_fields = ("actor__username", "target_user__username")
    readonly_fields = ("actor", "action", "target_user", "object_type", "object_id", "details", "ip_address", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SiteQRAudit)
class SiteQRAuditAdmin(admin.ModelAdmin):
    list_display = ("site", "regenerated_by", "regenerated_at")
    readonly_fields = ("site", "old_token", "new_token", "regenerated_by", "regenerated_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
