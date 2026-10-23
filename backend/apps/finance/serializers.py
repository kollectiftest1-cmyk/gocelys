from rest_framework import serializers

from .models import Due, Expense, FinanceCategory, FinancialTransaction, PaymentMethod, RecurringCharge


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ["id", "code", "name", "kind", "requires_reference", "available_pos", "available_online", "is_active", "position"]


class FinanceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FinanceCategory
        fields = ["id", "code", "name", "direction", "is_expense", "color"]


class TransactionSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    method_name = serializers.CharField(source="method.name", read_only=True, default=None)
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    source_label = serializers.CharField(source="get_source_display", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = FinancialTransaction
        fields = ["id", "reference", "direction", "source", "source_label", "category", "category_name", "amount", "currency",
                  "amount_cdf", "agency", "agency_name", "method", "method_name", "cash_session", "user_name", "label",
                  "external_reference", "source_id", "occurred_at"]
        read_only_fields = ["reference", "amount_cdf", "source", "source_id", "cash_session"]

    def get_user_name(self, obj):
        return str(obj.user) if obj.user_id else None


class ExpenseSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    method_name = serializers.CharField(source="method.name", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = ["id", "reference", "category", "category_name", "amount", "currency", "agency", "agency_name", "beneficiary",
                  "reason", "spent_on", "method", "method_name", "receipt", "status", "status_label", "created_by_name",
                  "approved_by_name", "approved_at", "rejection_reason", "created_at"]
        read_only_fields = ["reference", "status", "approved_at", "rejection_reason"]

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by_id else None

    def get_approved_by_name(self, obj):
        return str(obj.approved_by) if obj.approved_by_id else None

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Le montant doit être positif.")
        return value


class RecurringChargeSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    frequency_label = serializers.CharField(source="get_frequency_display", read_only=True)
    next_due = serializers.SerializerMethodField()

    class Meta:
        model = RecurringCharge
        fields = ["id", "name", "category", "category_name", "amount", "currency", "agency", "agency_name", "beneficiary",
                  "frequency", "frequency_label", "interval_days", "start_date", "end_date", "due_day", "remind_days_before",
                  "status", "next_due"]

    def get_next_due(self, obj):
        due = obj.dues.exclude(status__in=["paid", "cancelled"]).order_by("due_date").first()
        return {"id": due.id, "due_date": due.due_date, "status": due.status} if due else None


class DueSerializer(serializers.ModelSerializer):
    charge_name = serializers.CharField(source="charge.name", read_only=True)
    agency = serializers.IntegerField(source="charge.agency_id", read_only=True)
    agency_name = serializers.CharField(source="charge.agency.name", read_only=True)
    category_name = serializers.CharField(source="charge.category.name", read_only=True)
    beneficiary = serializers.CharField(source="charge.beneficiary", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Due
        fields = ["id", "charge", "charge_name", "agency", "agency_name", "category_name", "beneficiary", "due_date", "amount",
                  "currency", "status", "status_label", "paid_at", "transaction"]
        read_only_fields = fields
