"""Toutes les écritures de stock passent par ce module."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.utils import fmt_qty
from apps.core import audit
from apps.core.api import BusinessError
from apps.core.models import Sequence

from .models import Bucket, InventoryCount, InventoryLine, MovementKind, StockBalance, StockMovement, Transfer

D = Decimal


def _balance(agency, product, bucket, lock=True):
    qs = StockBalance.objects
    if lock:
        qs = qs.select_for_update()
    row, _ = qs.get_or_create(agency=agency, product=product, bucket=bucket)
    return row


def quantity(agency, product, bucket=Bucket.AVAILABLE):
    row = StockBalance.objects.filter(agency=agency, product=product, bucket=bucket).first()
    return row.quantity if row else D(0)


def record(*, agency, product, bucket, delta, kind, reference, user=None, reason="",
           source=None, occurred_at=None, allow_negative=False, attachment=None):
    """Écrit un mouvement et met à jour le solde en cache. Doit tourner dans une transaction."""
    delta = D(delta)
    if delta == 0:
        return None
    row = _balance(agency, product, bucket)
    before = row.quantity
    after = before + delta
    if after < 0 and not allow_negative:
        raise BusinessError(
            f"Stock {Bucket(bucket).label.lower()} insuffisant pour « {product.name} » "
            f"à {agency.name} : {fmt_qty(before)} disponible(s), {fmt_qty(abs(delta))} demandé(s).",
            code="insufficient_stock",
            product=product.pk, agency=agency.pk, available=float(before),
        )
    row.quantity = after
    row.save(update_fields=["quantity", "updated_at"])
    return StockMovement.objects.create(
        reference=reference, agency=agency, product=product, bucket=bucket, kind=kind,
        quantity=delta, balance_before=before, balance_after=after, user=user, reason=reason,
        source_type=source.__class__.__name__.lower() if source is not None else "",
        source_id=str(getattr(source, "pk", "") or ""),
        occurred_at=occurred_at or timezone.now(), attachment=attachment,
    )


def move(*, agency, product, quantity, from_bucket, to_bucket, kind, reference, **kw):
    """Déplace une quantité d'un compartiment à un autre (deux mouvements liés)."""
    quantity = D(quantity)
    out = record(agency=agency, product=product, bucket=from_bucket, delta=-quantity, kind=kind, reference=reference, **kw)
    kw.pop("allow_negative", None)
    inn = record(agency=agency, product=product, bucket=to_bucket, delta=quantity, kind=kind, reference=reference, **kw)
    return out, inn


# --------------------------------------------------------------------------- corrections
@transaction.atomic
def adjust(*, agency, product, new_quantity, user, reason, kind=MovementKind.CORRECTION, attachment=None):
    """Correction manuelle : on enregistre ancienne → nouvelle → différence → qui → quand → motif."""
    if not reason:
        raise BusinessError("Un motif est obligatoire pour toute correction de stock.")
    current = _balance(agency, product, Bucket.AVAILABLE).quantity
    delta = D(new_quantity) - current
    ref = Sequence.next("COR", agency.code)
    mv = record(agency=agency, product=product, bucket=Bucket.AVAILABLE, delta=delta, kind=kind,
                reference=ref, user=user, reason=reason, allow_negative=False, attachment=attachment)
    audit.log(user, "stock.adjust", "stock", product, agency=agency,
              before={"quantité": float(current)}, after={"quantité": float(new_quantity)}, note=reason)
    return mv


@transaction.atomic
def declare_loss(*, agency, product, quantity, user, reason, damaged=False, attachment=None):
    """Perte ou détérioration : sort du disponible vers « perdu » / « endommagé »."""
    ref = Sequence.next("PER", agency.code)
    to_bucket = Bucket.DAMAGED if damaged else Bucket.LOST
    kind = MovementKind.DAMAGE if damaged else MovementKind.LOSS
    move(agency=agency, product=product, quantity=quantity, from_bucket=Bucket.AVAILABLE,
         to_bucket=to_bucket, kind=kind, reference=ref, user=user, reason=reason, attachment=attachment)
    audit.log(user, "stock.damage" if damaged else "stock.loss", "stock", product, agency=agency,
              after={"quantité": float(quantity), "motif": reason})
    return ref


@transaction.atomic
def receive_production(*, agency, product, quantity, user, reason="Production"):
    ref = Sequence.next("PRD", agency.code)
    record(agency=agency, product=product, bucket=Bucket.AVAILABLE, delta=quantity,
           kind=MovementKind.PRODUCTION, reference=ref, user=user, reason=reason)
    return ref


# --------------------------------------------------------------------------- réservations
def reserve(*, agency, product, quantity, reference, user=None, source=None):
    return move(agency=agency, product=product, quantity=quantity, from_bucket=Bucket.AVAILABLE,
                to_bucket=Bucket.RESERVED, kind=MovementKind.RESERVATION, reference=reference,
                user=user, source=source)


def release(*, agency, product, quantity, reference, user=None, source=None):
    return move(agency=agency, product=product, quantity=quantity, from_bucket=Bucket.RESERVED,
                to_bucket=Bucket.AVAILABLE, kind=MovementKind.RELEASE, reference=reference,
                user=user, source=source)


def consume_reserved(*, agency, product, quantity, reference, user=None, source=None):
    return record(agency=agency, product=product, bucket=Bucket.RESERVED, delta=-D(quantity),
                  kind=MovementKind.ORDER_OUT, reference=reference, user=user, source=source)


# --------------------------------------------------------------------------- transferts
def _transition(transfer, allowed, target):
    if transfer.status not in allowed:
        raise BusinessError(
            f"Le transfert {transfer.reference} est « {transfer.get_status_display()} » : "
            f"action impossible."
        )
    transfer.status = target


@transaction.atomic
def create_transfer(*, source, destination, lines, user, reason="", at=None):
    if source.pk == destination.pk:
        raise BusinessError("L'agence source et l'agence destination doivent être différentes.")
    if not lines:
        raise BusinessError("Ajoutez au moins un produit au transfert.")
    transfer = Transfer.objects.create(
        reference=Sequence.next("TRF", source.code, at), source=source, destination=destination,
        reason=reason, requested_by=user,
    )
    for line in lines:
        if D(line["quantity"]) <= 0:
            raise BusinessError("Les quantités transférées doivent être positives.")
        transfer.lines.create(product=line["product"], quantity=line["quantity"])
    audit.log(user, "transfer.request", "transfer", transfer, agency=source)
    return transfer


@transaction.atomic
def validate_transfer(transfer, user, approve=True, note="", at=None):
    transfer = Transfer.objects.select_for_update().get(pk=transfer.pk)
    if approve:
        _transition(transfer, {Transfer.Status.REQUESTED}, Transfer.Status.VALIDATED)
        transfer.validated_by, transfer.validated_at = user, at or timezone.now()
    else:
        _transition(transfer, {Transfer.Status.REQUESTED, Transfer.Status.VALIDATED}, Transfer.Status.REJECTED)
    if note:
        transfer.note = (transfer.note + "\n" + note).strip()
    transfer.save()
    audit.log(user, "transfer.validate" if approve else "transfer.reject", "transfer", transfer, agency=transfer.source, note=note)
    return transfer


@transaction.atomic
def ship_transfer(transfer, user, shipped=None, at=None):
    """Expédition : disponible(source) → en transfert(source). Plus vendable à la source."""
    transfer = Transfer.objects.select_for_update().get(pk=transfer.pk)
    _transition(transfer, {Transfer.Status.VALIDATED, Transfer.Status.PREPARING}, Transfer.Status.SHIPPED)
    shipped = shipped or {}
    for line in transfer.lines.select_related("product"):
        qty = D(shipped.get(line.product_id, line.quantity))
        line.shipped_quantity = qty
        line.save(update_fields=["shipped_quantity"])
        move(agency=transfer.source, product=line.product, quantity=qty, from_bucket=Bucket.AVAILABLE,
             to_bucket=Bucket.IN_TRANSIT, kind=MovementKind.TRANSFER_OUT, reference=transfer.reference,
             user=user, source=transfer, reason=f"Vers {transfer.destination.name}", occurred_at=at)
    transfer.shipped_by, transfer.shipped_at = user, at or timezone.now()
    transfer.save()
    audit.log(user, "transfer.ship", "transfer", transfer, agency=transfer.source)
    return transfer


@transaction.atomic
def receive_transfer(transfer, user, received=None, damaged=None, note="", at=None):
    """
    Réception : en transfert(source) → disponible(destination).
    Les quantités endommagées vont en « endommagé » à destination ; un manque est tracé.
    """
    transfer = Transfer.objects.select_for_update().get(pk=transfer.pk)
    _transition(transfer, {Transfer.Status.SHIPPED}, Transfer.Status.CLOSED)
    received, damaged = received or {}, damaged or {}
    for line in transfer.lines.select_related("product"):
        shipped = line.shipped_quantity or D(0)
        bad = D(damaged.get(line.product_id, 0))
        good = D(received.get(line.product_id, shipped - bad))
        if good + bad > shipped:
            raise BusinessError(f"{line.product.name} : reçu ({fmt_qty(good + bad)}) supérieur à l'expédié ({fmt_qty(shipped)}).")
        missing = shipped - good - bad
        line.received_quantity, line.damaged_quantity = good, bad
        line.save(update_fields=["received_quantity", "damaged_quantity"])
        ref = transfer.reference
        record(agency=transfer.source, product=line.product, bucket=Bucket.IN_TRANSIT, delta=-shipped,
               kind=MovementKind.TRANSFER_IN, reference=ref, user=user, source=transfer, occurred_at=at)
        record(agency=transfer.destination, product=line.product, bucket=Bucket.AVAILABLE, delta=good,
               kind=MovementKind.TRANSFER_IN, reference=ref, user=user, source=transfer,
               reason=f"Depuis {transfer.source.name}", occurred_at=at)
        if bad:
            record(agency=transfer.destination, product=line.product, bucket=Bucket.DAMAGED, delta=bad,
                   kind=MovementKind.TRANSFER_GAP, reference=ref, user=user, source=transfer, reason="Reçu endommagé", occurred_at=at)
        if missing:
            record(agency=transfer.source, product=line.product, bucket=Bucket.LOST, delta=missing,
                   kind=MovementKind.TRANSFER_GAP, reference=ref, user=user, source=transfer, reason="Manquant à la réception", occurred_at=at)
    transfer.received_by, transfer.received_at = user, at or timezone.now()
    if note:
        transfer.note = (transfer.note + "\n" + note).strip()
    transfer.save()
    audit.log(user, "transfer.receive", "transfer", transfer, agency=transfer.destination, note=note)
    return transfer


@transaction.atomic
def cancel_transfer(transfer, user, note=""):
    transfer = Transfer.objects.select_for_update().get(pk=transfer.pk)
    _transition(transfer, {Transfer.Status.REQUESTED, Transfer.Status.VALIDATED, Transfer.Status.PREPARING}, Transfer.Status.CANCELLED)
    transfer.note = (transfer.note + "\n" + note).strip()
    transfer.save()
    audit.log(user, "transfer.cancel", "transfer", transfer, agency=transfer.source, note=note)
    return transfer


# --------------------------------------------------------------------------- inventaires
@transaction.atomic
def start_inventory(*, agency, user, products=None, note=""):
    from apps.catalog.models import Product

    inv = InventoryCount.objects.create(reference=Sequence.next("INV", agency.code), agency=agency,
                                        created_by=user, scope_note=note)
    products = products or Product.objects.filter(status=Product.Status.ACTIVE)
    for p in products:
        InventoryLine.objects.create(inventory=inv, product=p, expected=quantity(agency, p))
    audit.log(user, "inventory.start", "inventory", inv, agency=agency)
    return inv


@transaction.atomic
def submit_inventory(inv, user):
    if inv.status != InventoryCount.Status.DRAFT:
        raise BusinessError("Seul un inventaire en cours peut être soumis.")
    if inv.lines.filter(counted__isnull=True).exists():
        raise BusinessError("Tous les produits doivent être comptés avant la soumission.")
    inv.status, inv.submitted_at = InventoryCount.Status.SUBMITTED, timezone.now()
    inv.save()
    return inv


@transaction.atomic
def validate_inventory(inv, user):
    """Ajuste le stock disponible de l'écart (compté − théorique au moment du comptage)."""
    if inv.status != InventoryCount.Status.SUBMITTED:
        raise BusinessError("L'inventaire doit être soumis avant validation.")
    gaps = []
    for line in inv.lines.select_related("product"):
        gap = line.gap
        if gap:
            record(agency=inv.agency, product=line.product, bucket=Bucket.AVAILABLE, delta=gap,
                   kind=MovementKind.INVENTORY, reference=inv.reference, user=user, source=inv,
                   reason=line.note or "Écart d'inventaire", allow_negative=True)
            gaps.append({"produit": line.product.name, "écart": float(gap)})
    inv.status, inv.validated_by, inv.validated_at = InventoryCount.Status.VALIDATED, user, timezone.now()
    inv.save()
    audit.log(user, "inventory.validate", "inventory", inv, agency=inv.agency, after={"écarts": gaps})
    return inv


# --------------------------------------------------------------------------- reconstruction
@transaction.atomic
def rebuild_balances():
    """Recalcule tous les soldes depuis le registre des mouvements (règle 2)."""
    StockBalance.objects.all().delete()
    rows = (StockMovement.objects.values("agency_id", "product_id", "bucket")
            .annotate(total=Sum("quantity")))
    StockBalance.objects.bulk_create([
        StockBalance(agency_id=r["agency_id"], product_id=r["product_id"], bucket=r["bucket"], quantity=r["total"])
        for r in rows
    ])
    return len(rows)
