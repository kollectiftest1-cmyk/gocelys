import math
import random
import uuid
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.utils import fmt_money
from apps.agencies.models import Agency, DeliveryZone
from apps.catalog.models import Product, ProductUnit, Promotion
from apps.core import audit
from apps.core.api import BusinessError
from apps.core.models import Sequence, Setting
from apps.finance import services as finance
from apps.finance.models import FinancialTransaction, PaymentMethod
from apps.inventory import services as stock
from apps.inventory.models import Bucket

from .models import Order, OrderLine, OrderStatusHistory

D = Decimal
S = Order.Status

TRANSITIONS = {
    S.DRAFT: {S.CONFIRMED, S.CANCELLED},
    S.CONFIRMED: {S.ACCEPTED, S.REFUSED, S.CANCELLED},
    S.ACCEPTED: {S.PREPARING, S.CANCELLED},
    S.PREPARING: {S.READY, S.CANCELLED},
    S.READY: {S.DRIVER_ASSIGNED, S.COMPLETED, S.CANCELLED},
    S.DRIVER_ASSIGNED: {S.IN_DELIVERY, S.READY, S.CANCELLED},
    S.IN_DELIVERY: {S.DELIVERED, S.FAILED},
    S.DELIVERED: {S.COMPLETED},
    S.FAILED: {S.READY, S.CANCELLED},
    S.COMPLETED: {S.REFUNDED},
    S.CANCELLED: set(),
    S.REFUSED: set(),
    S.REFUNDED: set(),
}
CUSTOMER_CANCELLABLE = {S.DRAFT, S.CONFIRMED, S.ACCEPTED}
RELEASE_ON = {S.CANCELLED, S.REFUSED}


def _code(n=6):
    return "".join(random.choice("0123456789") for _ in range(n))


def _distance_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return math.inf
    r = 6371
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dp, dl = p2 - p1, math.radians(float(lng2) - float(lng1))
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def can_serve(agency, lines):
    return all(stock.quantity(agency, line["product"]) >= line["base_quantity"] for line in lines)


def choose_agency(*, requested, lines, latitude=None, longitude=None):
    """§14 — agence choisie, disponibilité, proximité, selon la règle paramétrée."""
    strategy = Setting.get("order_assignment", "chosen_then_stock")
    candidates = list(Agency.objects.filter(status=Agency.Status.ACTIVE, accepts_online_orders=True))
    if requested and requested in candidates and (strategy == "chosen" or can_serve(requested, lines)):
        return requested
    if strategy == "chosen" and requested:
        return requested
    serving = [a for a in candidates if can_serve(a, lines)]
    if not serving:
        return None
    if latitude is not None and longitude is not None:
        serving.sort(key=lambda a: _distance_km(latitude, longitude, a.latitude, a.longitude))
    return serving[0]


def _resolve(raw_lines):
    lines = []
    for raw in raw_lines:
        pu = None
        if raw.get("product_unit"):
            pu = ProductUnit.objects.select_related("product", "unit").get(pk=raw["product_unit"])
            product = pu.product
        else:
            product = Product.objects.get(pk=raw["product"])
        if product.status != Product.Status.ACTIVE or not product.sold_online:
            raise BusinessError(f"« {product.name} » n'est pas disponible à la commande.")
        qty = D(str(raw["quantity"]))
        if qty <= 0:
            raise BusinessError("Quantité invalide.")
        factor = pu.factor if pu else D(1)
        price = pu.current_price() if pu else product.current_price()
        label = f"{product.name} — {pu.unit.name}" if pu and factor != 1 else product.name
        lines.append({"product": product, "pu": pu, "quantity": qty, "factor": factor,
                      "base_quantity": qty * factor, "price": price, "label": label, "total": qty * price})
    if not lines:
        raise BusinessError("Le panier est vide.")
    return lines


def history(order, to_status, user=None, note=""):
    OrderStatusHistory.objects.create(order=order, from_status=order.status, to_status=to_status, user=user, note=note)
    order.status = to_status


@transaction.atomic
def place_order(*, customer, lines, fulfillment, user=None, requested_agency=None, address=None,
                zone=None, payment_method=None, promo_code=None, note="", client_uuid=None,
                channel="app", is_urgent=False, scheduled_for=None, at=None):
    """Parcours client : panier → agence → livraison/retrait → paiement → confirmation."""
    if client_uuid:
        existing = Order.objects.filter(client_uuid=client_uuid).first()
        if existing:
            return existing
    resolved = _resolve(lines)
    lat = getattr(address, "latitude", None)
    lng = getattr(address, "longitude", None)
    agency = choose_agency(requested=requested_agency, lines=resolved, latitude=lat, longitude=lng)
    if agency is None:
        raise BusinessError("Aucune agence ne dispose actuellement de tous les produits demandés.", code="no_agency")
    if fulfillment == Order.Fulfillment.DELIVERY:
        if address is None:
            raise BusinessError("Choisissez une adresse de livraison.")
        zone = zone or address.zone
        if zone is not None and zone.agency_id != agency.pk:
            zone = DeliveryZone.objects.filter(agency=agency, name=zone.name, is_active=True).first()
    subtotal = sum((line["total"] for line in resolved), D(0))
    discount, promotion = D(0), None
    if promo_code:
        promotion = Promotion.objects.filter(code__iexact=promo_code).first()
        if promotion is None:
            raise BusinessError("Code promotionnel invalide.")
        discount = promotion.discount_for(subtotal)
        if discount == 0:
            raise BusinessError("Ce code promotionnel n'est pas applicable à cette commande.")
        promotion.used += 1
        promotion.save(update_fields=["used"])
    fee = zone.fee if (zone and fulfillment == Order.Fulfillment.DELIVERY) else D(0)
    if zone and subtotal < zone.min_order:
        raise BusinessError(f"Montant minimum pour la zone {zone.name} : {fmt_money(zone.min_order)}.")
    order = Order.objects.create(
        reference=Sequence.next("CMD", agency.code, at), client_uuid=client_uuid or uuid.uuid4(), customer=customer,
        agency=agency, requested_agency=requested_agency, channel=channel, fulfillment=fulfillment,
        address=address, address_text=(f"{address.line} — {address.landmark}".strip(" —") if address else ""),
        latitude=lat, longitude=lng, zone=zone, subtotal=subtotal, discount=discount, delivery_fee=fee,
        total=subtotal - discount + fee, promotion=promotion, payment_method=payment_method,
        payment_status=Order.PaymentStatus.UNPAID, note=note, is_urgent=is_urgent, scheduled_for=scheduled_for,
        pickup_code=_code(4) if fulfillment == Order.Fulfillment.PICKUP else "",
    )
    for line in resolved:
        OrderLine.objects.create(order=order, product=line["product"], product_unit=line["pu"], label=line["label"],
                                 quantity=line["quantity"], factor=line["factor"], base_quantity=line["base_quantity"],
                                 unit_price=line["price"], total=line["total"])
    confirm(order, user=user)
    if payment_method and payment_method.kind != PaymentMethod.Kind.CASH:
        order.payment_status = Order.PaymentStatus.PENDING
        order.save(update_fields=["payment_status"])
    from apps.notifications.services import notify_perm, notify_customer

    notify_perm("orders.manage", agency, kind="new_order", level="danger" if is_urgent else "info",
                title=f"Nouvelle commande {order.reference}",
                body=f"{customer.name} · {fmt_money(order.total)} · {order.get_fulfillment_display()}",
                link=f"/commandes/{order.pk}")
    notify_customer(customer, title="Commande confirmée",
                    body=f"Votre commande {order.reference} a été transmise à {agency.name}.", link=f"order/{order.pk}")
    return order


def confirm(order, user=None):
    """Règle 3 : une commande confirmée réserve les produits nécessaires."""
    for line in order.lines.select_related("product"):
        stock.reserve(agency=order.agency, product=line.product, quantity=line.base_quantity,
                      reference=order.reference, user=user, source=order)
    order.stock_reserved = True
    order.confirmed_at = timezone.now()
    history(order, S.CONFIRMED, user, "Commande confirmée, stock réservé")
    order.save()


def _release(order, user):
    if not order.stock_reserved:
        return
    for line in order.lines.select_related("product"):
        stock.release(agency=order.agency, product=line.product, quantity=line.base_quantity,
                      reference=order.reference, user=user, source=order)
    order.stock_reserved = False


def _consume(order, user):
    if not order.stock_reserved:
        return
    for line in order.lines.select_related("product"):
        stock.consume_reserved(agency=order.agency, product=line.product, quantity=line.base_quantity,
                               reference=order.reference, user=user, source=order)
    order.stock_reserved = False


@transaction.atomic
def transition(order, to_status, *, user=None, note="", by_customer=False):
    order = Order.objects.select_for_update().get(pk=order.pk)
    allowed = TRANSITIONS.get(order.status, set())
    if to_status not in allowed:
        raise BusinessError(
            f"Impossible de passer la commande {order.reference} de « {order.get_status_display()} » "
            f"à « {S(to_status).label} »."
        )
    if by_customer and (to_status != S.CANCELLED or order.status not in CUSTOMER_CANCELLABLE):
        raise BusinessError("Cette commande ne peut plus être annulée depuis l'application.")
    if to_status in RELEASE_ON:
        _release(order, user)
    if to_status == S.READY:
        order.ready_at = timezone.now()
    if to_status == S.COMPLETED and order.fulfillment == Order.Fulfillment.PICKUP:
        _consume(order, user)
        _settle_payment(order, user)
    if to_status == S.DELIVERED:
        _consume(order, user)
        order.delivered_at = timezone.now()
    before = order.status
    history(order, to_status, user, note)
    order.save()
    audit.log(user, f"order.{to_status}", "order", order, before={"statut": before}, after={"statut": to_status}, note=note)
    _notify_status(order)
    return order


def _notify_status(order):
    from apps.notifications.services import notify_customer

    messages = {
        S.ACCEPTED: "Votre commande est acceptée par l'agence.",
        S.PREPARING: "Votre commande est en préparation.",
        S.READY: ("Votre commande est prête à retirer. Code de retrait : " + order.pickup_code)
        if order.fulfillment == Order.Fulfillment.PICKUP else "Votre commande est prête, un livreur va être affecté.",
        S.IN_DELIVERY: "Votre livreur est en route.",
        S.DELIVERED: "Commande livrée. Merci pour votre confiance !",
        S.COMPLETED: "Commande terminée. Merci !",
        S.REFUSED: "Votre commande n'a pas pu être acceptée par l'agence.",
        S.CANCELLED: "Votre commande a été annulée.",
    }
    if order.status in messages:
        notify_customer(order.customer, title=f"{order.reference} — {order.get_status_display()}",
                        body=messages[order.status], link=f"order/{order.pk}")


def _settle_payment(order, user, method=None, reference=""):
    """Enregistre l'encaissement de la commande s'il n'a pas déjà eu lieu."""
    if order.payment_status == Order.PaymentStatus.PAID:
        return None
    method = method or order.payment_method or PaymentMethod.objects.filter(kind="cash").first()
    tx = finance.record(direction="in", source=FinancialTransaction.Source.ORDER, amount=order.total,
                        agency=order.agency, method=method, user=user, label=f"Commande {order.reference}",
                        category_code="ventes", source_id=order.pk, external_reference=reference or order.payment_reference)
    order.payment_status = Order.PaymentStatus.PAID
    order.payment_method = method
    return tx


@transaction.atomic
def mark_paid(order, user, method=None, reference=""):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status in RELEASE_ON:
        raise BusinessError("Commande annulée : paiement impossible.")
    _settle_payment(order, user, method, reference)
    order.payment_reference = reference or order.payment_reference
    order.save()
    audit.log(user, "order.paid", "order", order, note=reference)
    return order


@transaction.atomic
def complete_pickup(order, user, code):
    if order.fulfillment != Order.Fulfillment.PICKUP:
        raise BusinessError("Cette commande n'est pas un retrait en agence.")
    if (code or "").strip() != order.pickup_code:
        raise BusinessError("Code de retrait incorrect.", code="bad_code")
    return transition(order, S.COMPLETED, user=user, note="Retrait en agence confirmé")


def reserved_quantity(order):
    return sum((line.base_quantity for line in order.lines.all()), D(0))


def stock_check(order):
    """Disponibilité de chaque ligne dans l'agence de la commande (pour l'écran de préparation)."""
    rows = []
    for line in order.lines.select_related("product"):
        rows.append({
            "product": line.product.name,
            "base_quantity": float(line.base_quantity),
            "available": float(stock.quantity(order.agency, line.product, Bucket.AVAILABLE)),
            "reserved": float(stock.quantity(order.agency, line.product, Bucket.RESERVED)),
        })
    return rows
