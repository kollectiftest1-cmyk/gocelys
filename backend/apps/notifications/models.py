from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class Notification(BaseModel):
    class Level(models.TextChoices):
        INFO = "info", "Information"
        SUCCESS = "success", "Succès"
        WARNING = "warning", "Attention"
        DANGER = "danger", "Urgent"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    kind = models.CharField(max_length=30, db_index=True)
    level = models.CharField(max_length=8, choices=Level.choices, default=Level.INFO)
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=500, blank=True)
    link = models.CharField(max_length=200, blank=True)
    dedupe_key = models.CharField(max_length=120, blank=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "notification"


class PushDevice(BaseModel):
    """Jeton Expo Push d'un appareil (app entreprise ou client)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_devices")
    token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=12, blank=True)
    app = models.CharField(max_length=20, default="entreprise")
    is_active = models.BooleanField(default=True)


class OutboundMessage(BaseModel):
    """File des SMS / WhatsApp / e-mails à envoyer par l'intégration retenue."""

    channel = models.CharField(max_length=10, choices=[("sms", "SMS"), ("whatsapp", "WhatsApp"), ("email", "E-mail"), ("push", "Push")])
    to = models.CharField(max_length=160)
    body = models.TextField()
    status = models.CharField(max_length=10, default="queued")
    error = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
