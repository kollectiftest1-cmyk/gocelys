from rest_framework import serializers

from .models import Delivery, Driver


class DriverSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    phone = serializers.CharField(source="user.phone", read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    active_deliveries = serializers.IntegerField(read_only=True, default=0)
    delivered_today = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Driver
        fields = ["id", "user", "name", "phone", "agency", "agency_name", "vehicle", "plate", "is_available", "is_active",
                  "last_latitude", "last_longitude", "last_seen_at", "active_deliveries", "delivered_today"]

    def get_name(self, obj):
        return str(obj.user)


class DeliverySerializer(serializers.ModelSerializer):
    order_reference = serializers.CharField(source="order.reference", read_only=True)
    order_status = serializers.CharField(source="order.status", read_only=True)
    customer_name = serializers.CharField(source="order.customer.name", read_only=True)
    customer_phone = serializers.CharField(source="order.customer.phone", read_only=True)
    address_text = serializers.CharField(source="order.address_text", read_only=True)
    latitude = serializers.DecimalField(source="order.latitude", max_digits=9, decimal_places=6, read_only=True)
    longitude = serializers.DecimalField(source="order.longitude", max_digits=9, decimal_places=6, read_only=True)
    total = serializers.DecimalField(source="order.total", max_digits=16, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(source="order.payment_status", read_only=True)
    payment_method_name = serializers.CharField(source="order.payment_method.name", read_only=True, default=None)
    note = serializers.CharField(source="order.note", read_only=True)
    driver_name = serializers.SerializerMethodField()
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    zone_name = serializers.CharField(source="zone.name", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    lines = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = ["id", "reference", "order", "order_reference", "order_status", "customer_name", "customer_phone",
                  "address_text", "latitude", "longitude", "total", "payment_status", "payment_method_name", "note",
                  "agency", "agency_name", "driver", "driver_name", "zone", "zone_name", "status", "status_label", "fee",
                  "assigned_at", "accepted_at", "departed_at", "arrived_at", "proof_method", "proof_photo", "proof_note",
                  "cash_collected", "failure_reason", "created_at", "lines"]

    def get_driver_name(self, obj):
        return str(obj.driver) if obj.driver_id else None

    def get_lines(self, obj):
        return [{"label": line.label, "quantity": line.quantity} for line in obj.order.lines.all()]
