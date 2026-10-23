from rest_framework import serializers

from .models import CashSession, Sale, SaleLine, SalePayment


class SaleLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLine
        fields = ["id", "product", "product_unit", "label", "quantity", "factor", "base_quantity", "unit_price", "discount", "total"]


class SalePaymentSerializer(serializers.ModelSerializer):
    method_name = serializers.CharField(source="method.name", read_only=True)
    method_kind = serializers.CharField(source="method.kind", read_only=True)

    class Meta:
        model = SalePayment
        fields = ["id", "method", "method_name", "method_kind", "amount", "reference"]


class SaleSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    pos_name = serializers.CharField(source="pos.name", read_only=True)
    cashier_name = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = ["id", "reference", "client_uuid", "agency", "agency_name", "pos", "pos_name", "session", "cashier",
                  "cashier_name", "customer", "customer_name", "currency", "subtotal", "discount", "discount_reason",
                  "total", "paid", "change_due", "status", "status_label", "occurred_at", "created_offline",
                  "offline_reference", "cancel_reason", "cancelled_at", "lines", "payments", "items_count"]

    def get_cashier_name(self, obj):
        return str(obj.cashier)

    def get_items_count(self, obj):
        return float(sum(line.quantity for line in obj.lines.all()))


class SaleCreateSerializer(serializers.Serializer):
    session = serializers.IntegerField()
    client_uuid = serializers.UUIDField(required=False)
    lines = serializers.ListField(child=serializers.DictField(), min_length=1)
    payments = serializers.ListField(child=serializers.DictField(), min_length=1)
    discount = serializers.DecimalField(max_digits=16, decimal_places=2, required=False, default=0)
    discount_reason = serializers.CharField(required=False, allow_blank=True, default="")
    promo_code = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    customer = serializers.IntegerField(required=False, allow_null=True)


class CashSessionSerializer(serializers.ModelSerializer):
    pos_name = serializers.CharField(source="pos.name", read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    cashier_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    validated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CashSession
        fields = ["id", "reference", "pos", "pos_name", "agency", "agency_name", "cashier", "cashier_name", "currency",
                  "status", "status_label", "opened_at", "opening_float", "closed_at", "expected_cash", "counted_cash",
                  "difference", "count_detail", "justification", "validated_by_name", "validated_at", "client_uuid"]
        read_only_fields = fields

    def get_cashier_name(self, obj):
        return str(obj.cashier)

    def get_validated_by_name(self, obj):
        return str(obj.validated_by) if obj.validated_by_id else None
