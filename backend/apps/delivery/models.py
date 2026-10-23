"""Livreurs et livraisons (cahier des charges §16)."""
from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, money_field


class Driver(BaseModel):
    class Vehicle(models.TextChoices):
        MOTO = "moto", "Moto"
        TRICYCLE = "tricycle", "Tricycle"
        VAN = "van", "Camionnette"
        FOOT = "foot", "À pied"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver")
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="drivers")
    vehicle = models.CharField(max_length=10, choices=Vehicle.choices, default=Vehicle.MOTO)
    plate = models.CharField(max_length=20, blank=True)
    is_available = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    last_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["user__first_name"]
        verbose_name = "livreur"

    def __str__(self):
        return str(self.user)


class Delivery(BaseModel):
    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Affectée"
        ACCEPTED = "accepted", "Acceptée"
        PICKED_UP = "picked_up", "Colis récupéré"
        EN_ROUTE = "en_route", "En route"
        DELIVERED = "delivered", "Livrée"
        FAILED = "failed", "Échouée"
        CANCELLED = "cancelled", "Annulée"

    reference = models.CharField(max_length=40, unique=True)
    order = models.OneToOneField("orders.Order", on_delete=models.PROTECT, related_name="delivery")
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="deliveries")
    driver = models.ForeignKey(Driver, null=True, blank=True, on_delete=models.PROTECT, related_name="deliveries")
    zone = models.ForeignKey("agencies.DeliveryZone", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ASSIGNED, db_index=True)
    fee = money_field()
    otp_code = models.CharField(max_length=6)
    assigned_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    departed_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    proof_method = models.CharField(max_length=12, blank=True, help_text="otp, photo, signature, driver")
    proof_photo = models.ImageField(upload_to="deliveries/", blank=True, null=True)
    proof_signature = models.TextField(blank=True, help_text="Signature (SVG/base64)")
    proof_note = models.CharField(max_length=255, blank=True)
    cash_collected = money_field()
    failure_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "livraison"

    def __str__(self):
        return self.reference
