from django.contrib import admin

from .models import AuditLog, Sequence, Setting


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["at", "user", "agency", "action", "entity_type", "entity_label", "sensitive"]
    list_filter = ["sensitive", "entity_type", "agency"]
    search_fields = ["entity_label", "action", "note"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(Setting)
admin.site.register(Sequence)
