"""POS, ventes et sessions de caisse (cahier des charges §11, §12, §32, règle 5)."""
from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, Currency, money_field


class CashSession(BaseModel):
    class Status(models.TextChoices):
        OPEN = "open", "Ouverte"
        CLOSED = "closed", "Clôturée"
        VALIDATED = "validated", "Validée"

    reference = models.CharField(max_length=40, unique=True)
    pos = models.ForeignKey("agencies.PointOfSale", on_delete=models.PROTECT, related_name="sessions")
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="cash_sessions")
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cash_sessions")
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.CDF)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN, db_index=True)
    opened_at = models.DateTimeField()
    opening_float = money_field(help_text="Fonds de caisse initial")
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_cash = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True, help_text="Solde théorique espèces")
    counted_cash = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    difference = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    count_detail = models.JSONField(default=dict, blank=True, help_text="Billetage {\"20000\": 12, ...}")
    justification = models.TextField(blank=True)
    validated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    validated_at = models.DateTimeField(null=True, blank=True)
    client_uuid = models.UUIDField(null=True, blank=True, unique=True, help_text="Identifiant créé hors connexion")

    class Meta:
        ordering = ["-opened_at"]
        verbose_name = "session de caisse"

    def __str__(self):
        return self.reference


class Sale(BaseModel):
    class Status(models.TextChoices):
        COMPLETED = "completed", "Encaissée"
        CANCELLED = "cancelled", "Annulée"
        REFUNDED = "refunded", "Remboursée"
        PARTIAL_REFUND = "partial_refund", "Remboursée partiellement"

    reference = models.CharField(max_length=40, unique=True)
    client_uuid = models.UUIDField(unique=True, help_text="Clé d'idempotence générée par le POS")
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="sales")
    pos = models.ForeignKey("agencies.PointOfSale", on_delete=models.PROTECT, related_name="sales")
    session = models.ForeignKey(CashSession, on_delete=models.PROTECT, related_name="sales")
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales")
    customer = models.ForeignKey("orders.Customer", null=True, blank=True, on_delete=models.SET_NULL, related_name="pos_sales")
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.CDF)
    subtotal = money_field()
    discount = money_field()
    discount_reason = models.CharField(max_length=160, blank=True)
    promotion = models.ForeignKey("catalog.Promotion", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    total = money_field()
    paid = money_field()
    change_due = money_field()
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.COMPLETED, db_index=True)
    occurred_at = models.DateTimeField(db_index=True, help_text="Heure réelle de la vente (appareil)")
    created_offline = models.BooleanField(default=False)
    offline_reference = models.CharField(max_length=40, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)
    receipt_sent_to = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ["-occurred_at"]
        verbose_name = "vente"

    def __str__(self):
        return self.reference


class SaleLine(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="+")
    product_unit = models.ForeignKey("catalog.ProductUnit", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    label = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    factor = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    base_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price = money_field()
    discount = money_field()
    total = money_field()
    refunded_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)


class SalePayment(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="payments")
    method = models.ForeignKey("finance.PaymentMethod", on_delete=models.PROTECT, related_name="+")
    amount = money_field()
    reference = models.CharField(max_length=80, blank=True)
    transaction = models.ForeignKey("finance.FinancialTransaction", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")


class SyncOperation(models.Model):
    """Registre d'idempotence des opérations remontées par les appareils hors ligne."""

    class Status(models.TextChoices):
        APPLIED = "applied", "Appliquée"
        REJECTED = "rejected", "Rejetée"

    op_id = models.UUIDField(unique=True)
    device_id = models.CharField(max_length=80, db_index=True)
    kind = models.CharField(max_length=40)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    payload = models.JSONField()
    status = models.CharField(max_length=10, choices=Status.choices)
    result = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    occurred_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-received_at"]
        verbose_name = "opération synchronisée"
