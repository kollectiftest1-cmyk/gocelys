from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Role, User, UserRole


class UserRoleInline(admin.TabularInline):
    model = UserRole
    extra = 0


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["username", "first_name", "last_name", "phone", "kind", "is_active"]
    list_filter = ["kind", "is_active"]
    fieldsets = BaseUserAdmin.fieldsets + (("Gocelsys", {"fields": ("phone", "kind", "default_agency")}),)
    inlines = [UserRoleInline]


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "scope", "is_system", "is_active"]
