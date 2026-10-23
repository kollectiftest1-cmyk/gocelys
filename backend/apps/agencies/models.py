from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, money_field


class Agency(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspendue"
        CLOSED_TEMP = "closed_temp", "Fermée temporairement"
        CLOSED = "closed", "Fermée définitivement"

    code = models.CharField(max_length=12, unique=True, help_text="Ex. MAT, BOM")
    name = models.CharField(max_length=120)
    city = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    manager = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="managed_agencies")
    opening_hours = models.JSONField(default=dict, blank=True, help_text='{"lun": "07:00-19:00", ...}')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    accepts_online_orders = models.BooleanField(default=True)
    is_production_site = models.BooleanField(default=False, help_text="Site de production / dépôt central")
    color = models.CharField(max_length=9, blank=True, help_text="Couleur d'identification dans les graphiques")

    class Meta:
        ordering = ["name"]
        verbose_name = "agence"

    def __str__(self):
        return self.name

    @property
    def is_operational(self):
        return self.status == self.Status.ACTIVE


class PointOfSale(BaseModel):
    """Un POS = un poste de vente (et sa caisse) dans une agence."""

    agency = models.ForeignKey(Agency, on_delete=models.CASCADE, related_name="points_of_sale")
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=80)
    device_id = models.CharField(max_length=80, blank=True, help_text="Identifiant de l'appareil appairé")
    default_float = money_field(help_text="Fonds de caisse habituel proposé à l'ouverture")
    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("agency", "code")]
        ordering = ["agency__name", "code"]
        verbose_name = "point de vente"

    def __str__(self):
        return f"{self.agency.code} · {self.name}"


class DeliveryZone(BaseModel):
    agency = models.ForeignKey(Agency, on_delete=models.CASCADE, related_name="zones")
    name = models.CharField(max_length=80)
    fee = money_field()
    min_order = money_field()
    estimated_minutes = models.PositiveIntegerField(default=45)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["agency__name", "name"]
        verbose_name = "zone de livraison"

    def __str__(self):
        return f"{self.name} ({self.agency.code})"
