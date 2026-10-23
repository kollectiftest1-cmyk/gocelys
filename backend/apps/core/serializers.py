from rest_framework import serializers

from .models import AuditLog, Setting


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    agency_name = serializers.CharField(source="agency.name", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "at", "user", "user_name", "agency", "agency_name", "action", "entity_type", "entity_id",
                  "entity_label", "before", "after", "note", "ip", "sensitive"]

    def get_user_name(self, obj):
        return (obj.user.get_full_name() or obj.user.username) if obj.user_id else "Système"


class SettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Setting
        fields = ["key", "value", "label", "updated_at"]
