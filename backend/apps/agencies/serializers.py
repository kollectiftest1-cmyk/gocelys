from rest_framework import serializers

from .models import Agency, DeliveryZone, PointOfSale


class PointOfSaleSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    open_session = serializers.SerializerMethodField()
    cashiers = serializers.SerializerMethodField()

    class Meta:
        model = PointOfSale
        fields = ["id", "agency", "agency_name", "code", "name", "default_float", "device_id", "is_active", "last_sync_at",
                  "open_session", "cashiers"]
        read_only_fields = ["last_sync_at"]

    def get_cashiers(self, obj):
        return [{"id": u.id, "name": str(u)} for u in obj.cashiers.filter(is_active=True)]

    def get_open_session(self, obj):
        s = obj.sessions.filter(status="open").select_related("cashier").first()
        if not s:
            return None
        return {"id": s.id, "reference": s.reference, "cashier": str(s.cashier), "opened_at": s.opened_at}


class DeliveryZoneSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True)

    class Meta:
        model = DeliveryZone
        fields = ["id", "agency", "agency_name", "name", "fee", "min_order", "estimated_minutes", "is_active"]


class AgencySerializer(serializers.ModelSerializer):
    manager_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    pos_count = serializers.IntegerField(read_only=True, default=0)
    staff_count = serializers.IntegerField(read_only=True, default=0)
    open_sessions = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Agency
        fields = ["id", "code", "name", "city", "address", "phone", "manager", "manager_name", "opening_hours",
                  "latitude", "longitude", "status", "status_label", "accepts_online_orders", "is_production_site",
                  "color", "created_at", "pos_count", "staff_count", "open_sessions"]

    def get_manager_name(self, obj):
        return str(obj.manager) if obj.manager_id else None

    def validate_code(self, value):
        return value.upper().strip()


class AgencyDetailSerializer(AgencySerializer):
    points_of_sale = PointOfSaleSerializer(many=True, read_only=True)
    zones = DeliveryZoneSerializer(many=True, read_only=True)

    class Meta(AgencySerializer.Meta):
        fields = AgencySerializer.Meta.fields + ["points_of_sale", "zones"]
