"""
Stocks par agence (cahier des charges §8 à §10, §15, règles 2 et 4).

Principe : le registre `StockMovement` est la source de vérité. Chaque mouvement est
un delta signé sur UN compartiment (disponible, réservé, en transfert, endommagé,
perdu, retourné) d'une agence. `StockBalance` est un cache maintenu dans la même
transaction ; `manage.py rebuild_stock` le reconstruit depuis le registre.
"""
from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class Bucket(models.TextChoices):
    AVAILABLE = "available", "Disponible"
    RESERVED = "reserved", "Réservé"
    IN_TRANSIT = "in_transit", "En transfert"
    DAMAGED = "damaged", "Endommagé"
    LOST = "lost", "Perdu"
    RETURNED = "returned", "Retourné"


class MovementKind(models.TextChoices):
    INITIAL = "initial", "Stock initial"
    PRODUCTION = "production", "Production / réception"
    SALE = "sale", "Vente"
    SALE_CANCEL = "sale_cancel", "Annulation de vente"
    RETURN = "return", "Retour client"
    TRANSFER_OUT = "transfer_out", "Transfert — expédition"
    TRANSFER_IN = "transfer_in", "Transfert — réception"
    TRANSFER_GAP = "transfer_gap", "Transfert — écart"
    LOSS = "loss", "Perte"
    DAMAGE = "damage", "Détérioration"
    INVENTORY = "inventory", "Ajustement d'inventaire"
    CORRECTION = "correction", "Correction autorisée"
    RESERVATION = "reservation", "Réservation"
    RELEASE = "release", "Libération de réservation"
    ORDER_OUT = "order_out", "Sortie commande"


class StockBalance(models.Model):
    agency = models.ForeignKey("agencies.Agency", on_delete=models.CASCADE, related_name="balances")
    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="balances")
    bucket = models.CharField(max_length=12, choices=Bucket.choices)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("agency", "product", "bucket")]
        indexes = [models.Index(fields=["agency", "bucket"])]

    def __str__(self):
        return f"{self.agency.code} {self.product.code} {self.bucket}={self.quantity}"


class StockMovement(BaseModel):
    reference = models.CharField(max_length=40, db_index=True, help_text="Référence de l'opération")
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="movements")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="movements")
    bucket = models.CharField(max_length=12, choices=Bucket.choices)
    kind = models.CharField(max_length=14, choices=MovementKind.choices, db_index=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, help_text="Delta signé, unité de base")
    balance_before = models.DecimalField(max_digits=14, decimal_places=3)
    balance_after = models.DecimalField(max_digits=14, decimal_places=3)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reason = models.CharField(max_length=255, blank=True)
    attachment = models.FileField(upload_to="stock/", blank=True, null=True)
    source_type = models.CharField(max_length=30, blank=True)
    source_id = models.CharField(max_length=64, blank=True)
    occurred_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        verbose_name = "mouvement de stock"

    def __str__(self):
        return f"{self.reference} {self.kind} {self.quantity:+}"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Un mouvement de stock ne se modifie pas : créez un mouvement correctif.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Un mouvement de stock ne se supprime pas (traçabilité).")


class Transfer(BaseModel):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Demandé"
        VALIDATED = "validated", "Validé"
        PREPARING = "preparing", "En préparation"
        SHIPPED = "shipped", "Expédié"
        RECEIVED = "received", "Réceptionné"
        CLOSED = "closed", "Clôturé"
        CANCELLED = "cancelled", "Annulé"
        REJECTED = "rejected", "Refusé"

    reference = models.CharField(max_length=40, unique=True)
    source = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="transfers_out")
    destination = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="transfers_in")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED, db_index=True)
    reason = models.CharField(max_length=255, blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    validated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    shipped_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    validated_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "transfert"

    def __str__(self):
        return self.reference

    @property
    def agency(self):
        return self.source


class TransferLine(models.Model):
    transfer = models.ForeignKey(Transfer, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    shipped_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    received_quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    damaged_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)


class InventoryCount(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "En cours de comptage"
        SUBMITTED = "submitted", "Soumis"
        VALIDATED = "validated", "Validé et ajusté"
        CANCELLED = "cancelled", "Annulé"

    reference = models.CharField(max_length=40, unique=True)
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="inventories")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    scope_note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    validated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    submitted_at = models.DateTimeField(null=True, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "inventaire"

    def __str__(self):
        return self.reference


class InventoryLine(models.Model):
    inventory = models.ForeignKey(InventoryCount, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="+")
    expected = models.DecimalField(max_digits=14, decimal_places=3, help_text="Stock théorique au lancement")
    counted = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = [("inventory", "product")]

    @property
    def gap(self):
        if self.counted is None:
            return None
        return self.counted - self.expected
