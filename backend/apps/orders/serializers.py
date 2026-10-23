from rest_framework import serializers

from .models import Address, Customer, Order, OrderLine, OrderStatusHistory


class AddressSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source="zone.name", read_only=True, default=None)

    class Meta:
        model = Address
        fields = ["id", "label", "line", "landmark", "city", "latitude", "longitude", "zone", "zone_name", "is_default"]


class CustomerSerializer(serializers.ModelSerializer):
    addresses = AddressSerializer(many=True, read_only=True)
    orders_count = serializers.IntegerField(read_only=True, default=0)
    total_spent = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True, default=0)
    preferred_agency_name = serializers.CharField(source="preferred_agency.name", read_only=True, default=None)
    has_account = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "email", "preferred_agency", "preferred_agency_name", "loyalty_points", "status",
                  "notes", "created_at", "addresses", "orders_count", "total_spent", "has_account"]
        read_only_fields = ["loyalty_points"]

    def get_has_account(self, obj):
        return obj.user_id is not None

    def validate_phone(self, value):
        from apps.accounts.backends import normalize_phone

        phone = normalize_phone(value)
        if len(phone) < 9:
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        qs = Customer.objects.filter(phone=phone)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Un client existe déjà avec ce numéro.")
        return phone


class OrderLineSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(source="product.image", read_only=True)

    class Meta:
        model = OrderLine
        fields = ["id", "product", "product_unit", "label", "quantity", "factor", "base_quantity", "unit_price", "total", "image"]


class OrderHistorySerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    to_label = serializers.SerializerMethodField()

    class Meta:
        model = OrderStatusHistory
        fields = ["id", "from_status", "to_status", "to_label", "user_name", "note", "at"]

    def get_user_name(self, obj):
        return str(obj.user) if obj.user_id else None

    def get_to_label(self, obj):
        return Order.Status(obj.to_status).label


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    history = OrderHistorySerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True, default=None)
    zone_name = serializers.CharField(source="zone.name", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    fulfillment_label = serializers.CharField(source="get_fulfillment_display", read_only=True)
    payment_status_label = serializers.CharField(source="get_payment_status_display", read_only=True)
    payment_method_name = serializers.CharField(source="payment_method.name", read_only=True, default=None)
    delivery = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    next_actions = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "reference", "customer", "customer_name", "customer_phone", "agency", "agency_name", "channel",
                  "fulfillment", "fulfillment_label", "status", "status_label", "is_urgent", "address", "address_text",
                  "latitude", "longitude", "zone", "zone_name", "currency", "subtotal", "discount", "delivery_fee",
                  "total", "payment_method", "payment_method_name", "payment_status", "payment_status_label",
                  "payment_reference", "pickup_code", "note", "scheduled_for", "confirmed_at", "ready_at",
                  "delivered_at", "created_at", "lines", "history", "delivery", "items_count", "next_actions", "rating"]

    def get_delivery(self, obj):
        d = getattr(obj, "delivery", None)
        if d is None:
            return None
        data = {"id": d.id, "reference": d.reference, "status": d.status, "status_label": d.get_status_display(),
                "driver": d.driver_id, "driver_name": str(d.driver) if d.driver_id else None,
                "driver_phone": d.driver.user.phone if d.driver_id else None,
                "assigned_at": d.assigned_at, "departed_at": d.departed_at, "arrived_at": d.arrived_at,
                "proof_method": d.proof_method}
        request = self.context.get("request")
        if request and getattr(request.user, "kind", "") == "customer":
            data["otp_code"] = d.otp_code
        return data

    def get_items_count(self, obj):
        return float(sum(line.quantity for line in obj.lines.all()))

    def get_next_actions(self, obj):
        from .services import TRANSITIONS

        return sorted(TRANSITIONS.get(obj.status, set()))


class OrderListSerializer(OrderSerializer):
    class Meta(OrderSerializer.Meta):
        fields = [f for f in OrderSerializer.Meta.fields if f not in ("history",)]


class PlaceOrderSerializer(serializers.Serializer):
    client_uuid = serializers.UUIDField(required=False)
    lines = serializers.ListField(child=serializers.DictField(), min_length=1)
    fulfillment = serializers.ChoiceField(choices=Order.Fulfillment.choices)
    agency = serializers.IntegerField(required=False, allow_null=True)
    address = serializers.IntegerField(required=False, allow_null=True)
    zone = serializers.IntegerField(required=False, allow_null=True)
    payment_method = serializers.IntegerField(required=False, allow_null=True)
    payment_reference = serializers.CharField(required=False, allow_blank=True)
    promo_code = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    is_urgent = serializers.BooleanField(required=False, default=False)
    customer = serializers.IntegerField(required=False, help_text="Saisie par le personnel (commande téléphone)")
    channel = serializers.CharField(required=False, default="app")
