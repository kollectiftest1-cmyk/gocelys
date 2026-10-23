from rest_framework import serializers

from .models import InventoryCount, InventoryLine, StockMovement, Transfer, TransferLine


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    user_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    bucket_label = serializers.CharField(source="get_bucket_display", read_only=True)

    class Meta:
        model = StockMovement
        fields = ["id", "reference", "agency", "agency_name", "product", "product_name", "bucket", "bucket_label",
                  "kind", "kind_label", "quantity", "balance_before", "balance_after", "user", "user_name", "reason",
                  "attachment", "source_type", "source_id", "occurred_at"]

    def get_user_name(self, obj):
        return str(obj.user) if obj.user_id else "Système"


class TransferLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit = serializers.CharField(source="product.base_unit.name", read_only=True)

    class Meta:
        model = TransferLine
        fields = ["id", "product", "product_name", "unit", "quantity", "shipped_quantity", "received_quantity", "damaged_quantity"]
        read_only_fields = ["shipped_quantity", "received_quantity", "damaged_quantity"]


class TransferSerializer(serializers.ModelSerializer):
    lines = TransferLineSerializer(many=True)
    source_name = serializers.CharField(source="source.name", read_only=True)
    destination_name = serializers.CharField(source="destination.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    total_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Transfer
        fields = ["id", "reference", "source", "source_name", "destination", "destination_name", "status", "status_label",
                  "reason", "note", "requested_by", "requested_by_name", "validated_at", "shipped_at", "received_at",
                  "created_at", "lines", "total_quantity"]
        read_only_fields = ["reference", "status", "requested_by", "validated_at", "shipped_at", "received_at", "note"]

    def get_requested_by_name(self, obj):
        return str(obj.requested_by) if obj.requested_by_id else None

    def get_total_quantity(self, obj):
        return float(sum(line.quantity for line in obj.lines.all()))


class InventoryLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.code", read_only=True)
    unit = serializers.CharField(source="product.base_unit.name", read_only=True)
    gap = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True)

    class Meta:
        model = InventoryLine
        fields = ["id", "product", "product_name", "product_code", "unit", "expected", "counted", "gap", "note"]
        read_only_fields = ["product", "expected"]


class InventorySerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    lines = InventoryLineSerializer(many=True, read_only=True)

    class Meta:
        model = InventoryCount
        fields = ["id", "reference", "agency", "agency_name", "status", "status_label", "scope_note", "created_by_name",
                  "created_at", "submitted_at", "validated_at", "progress", "lines"]
        read_only_fields = ["reference", "status", "submitted_at", "validated_at"]

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by_id else None

    def get_progress(self, obj):
        lines = list(obj.lines.all())
        counted = [line for line in lines if line.counted is not None]
        gaps = [line for line in counted if line.gap]
        return {"total": len(lines), "counted": len(counted), "gaps": len(gaps),
                "gap_total": float(sum((line.gap for line in gaps), 0))}
