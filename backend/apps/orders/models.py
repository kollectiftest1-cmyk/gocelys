"""Clients et commandes à distance (cahier des charges §13 à §18)."""
from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, Currency, money_field


class Customer(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Actif"
        BLOCKED = "blocked", "Bloqué"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="customer")
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=32, db_index=True)
    email = models.EmailField(blank=True)
    preferred_agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    loyalty_points = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "client"

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Address(BaseModel):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(max_length=60, default="Domicile")
    line = models.CharField(max_length=255)
    landmark = models.CharField(max_length=160, blank=True, help_text="Repère (en face de…)")
    city = models.CharField(max_length=80, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    zone = models.ForeignKey("agencies.DeliveryZone", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_default", "label"]
        verbose_name = "adresse"

    def __str__(self):
        return f"{self.label} — {self.line}"


class Order(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        CONFIRMED = "confirmed", "Confirmée"
        ACCEPTED = "accepted", "Acceptée"
        PREPARING = "preparing", "En préparation"
        READY = "ready", "Prête"
        DRIVER_ASSIGNED = "driver_assigned", "Livreur affecté"
        IN_DELIVERY = "in_delivery", "En livraison"
        DELIVERED = "delivered", "Livrée"
        COMPLETED = "completed", "Terminée"
        CANCELLED = "cancelled", "Annulée"
        REFUSED = "refused", "Refusée"
        FAILED = "failed", "Échouée"
        REFUNDED = "refunded", "Remboursée"

    class Fulfillment(models.TextChoices):
        DELIVERY = "delivery", "Livraison"
        PICKUP = "pickup", "Retrait en agence"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Non payée"
        PENDING = "pending", "Paiement en attente"
        PAID = "paid", "Payée"
        REFUNDED = "refunded", "Remboursée"

    reference = models.CharField(max_length=40, unique=True)
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="orders")
    agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.PROTECT, related_name="orders")
    requested_agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    channel = models.CharField(max_length=12, default="app", help_text="app, web, téléphone, whatsapp")
    fulfillment = models.CharField(max_length=10, choices=Fulfillment.choices, default=Fulfillment.DELIVERY)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True)
    is_urgent = models.BooleanField(default=False)
    address = models.ForeignKey(Address, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    address_text = models.CharField(max_length=400, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    zone = models.ForeignKey("agencies.DeliveryZone", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.CDF)
    subtotal = money_field()
    discount = money_field()
    delivery_fee = money_field()
    total = money_field()
    promotion = models.ForeignKey("catalog.Promotion", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    payment_method = models.ForeignKey("finance.PaymentMethod", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    payment_status = models.CharField(max_length=8, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID)
    payment_reference = models.CharField(max_length=80, blank=True)
    pickup_code = models.CharField(max_length=6, blank=True)
    note = models.CharField(max_length=400, blank=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    stock_reserved = models.BooleanField(default=False)
    rating = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "commande"

    def __str__(self):
        return self.reference


class OrderLine(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="+")
    product_unit = models.ForeignKey("catalog.ProductUnit", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    label = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    factor = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    base_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price = money_field()
    total = money_field()


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="history")
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    note = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]
