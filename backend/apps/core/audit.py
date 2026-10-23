"""Écriture du journal d'activité (cahier des charges §30.1)."""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from django.db import models

from .middleware import current_ip

SENSITIVE_ENTITIES = {
    "stock", "price", "product", "expense", "refund", "cash_session", "user",
    "role", "permission", "order", "transfer", "sale", "inventory", "due",
}


def _json(value):
    if isinstance(value, (Decimal,)):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, models.Model):
        return str(value.pk)
    if isinstance(value, dict):
        return {k: _json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json(v) for v in value]
    return value


def snapshot(obj, fields=None):
    """Capture un état simple d'un modèle (pour avant/après)."""
    if obj is None:
        return None
    data = {}
    for field in obj._meta.concrete_fields:
        if fields and field.name not in fields:
            continue
        if field.name in {"password"}:
            continue
        data[field.name] = _json(getattr(obj, field.attname))
    return data


def diff(before, after):
    if not before or not after:
        return before, after
    keys = {k for k in after if before.get(k) != after.get(k)}
    keys.discard("updated_at")
    return {k: before.get(k) for k in keys}, {k: after.get(k) for k in keys}


def log(user, action, entity_type, obj=None, *, entity_id="", label="", agency=None,
        before=None, after=None, note=""):
    from .models import AuditLog

    if obj is not None:
        entity_id = entity_id or str(getattr(obj, "uid", obj.pk))
        label = label or str(obj)[:200]
        if agency is None:
            agency = getattr(obj, "agency", None)
    if before is not None and after is not None:
        before, after = diff(before, after)
    return AuditLog.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        agency=agency if agency is not None and getattr(agency, "pk", None) else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        entity_label=label,
        before=_json(before),
        after=_json(after),
        note=note,
        ip=current_ip(),
        sensitive=entity_type in SENSITIVE_ENTITIES,
    )
