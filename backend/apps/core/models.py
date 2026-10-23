import uuid

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class BaseModel(models.Model):
    """Socle commun : identifiant public UUID + horodatage."""

    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class Currency(models.TextChoices):
    CDF = "CDF", "Franc congolais"
    USD = "USD", "Dollar américain"


def money_field(**kwargs):
    kwargs.setdefault("max_digits", 16)
    kwargs.setdefault("decimal_places", 2)
    kwargs.setdefault("default", 0)
    return models.DecimalField(**kwargs)


class Sequence(models.Model):
    """Compteurs de références métiers (VTE-..., CMD-..., TRF-...)."""

    key = models.CharField(max_length=80, unique=True)
    value = models.PositiveBigIntegerField(default=0)

    @classmethod
    def next(cls, prefix, scope="", at=None):
        when = timezone.localtime(at) if at is not None else timezone.localtime()
        day = when.strftime("%y%m%d")
        key = f"{prefix}:{scope}:{day}"
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(key=key)
            seq.value += 1
            seq.save(update_fields=["value"])
        parts = [prefix]
        if scope:
            parts.append(scope)
        parts.append(day)
        parts.append(f"{seq.value:04d}")
        return "-".join(parts)


class Setting(models.Model):
    """Paramètres métier modifiables (taux USD, seuils, stratégie d'affectation…)."""

    key = models.CharField(max_length=80, unique=True)
    value = models.JSONField()
    label = models.CharField(max_length=160, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "paramètre"
        ordering = ["key"]

    def __str__(self):
        return self.key

    @classmethod
    def get(cls, key, default=None):
        row = cls.objects.filter(key=key).first()
        if row is not None:
            return row.value
        return settings.GOCELSYS_DEFAULTS.get(key, default)

    @classmethod
    def all_values(cls):
        values = dict(settings.GOCELSYS_DEFAULTS)
        values.update({row.key: row.value for row in cls.objects.all()})
        return values


class AuditLog(models.Model):
    """Journal d'activité : qui, quand, quelle agence, quel élément, avant/après."""

    at = models.DateTimeField(default=timezone.now, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=60, db_index=True)
    entity_type = models.CharField(max_length=60, db_index=True)
    entity_id = models.CharField(max_length=64, blank=True)
    entity_label = models.CharField(max_length=200, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    note = models.TextField(blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    sensitive = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["-at"]
        verbose_name = "entrée du journal"
        verbose_name_plural = "journal d'activité"

    def __str__(self):
        return f"{self.at:%Y-%m-%d %H:%M} {self.action} {self.entity_type}#{self.entity_id}"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Le journal d'activité est en écriture seule.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Le journal d'activité ne peut pas être supprimé.")
