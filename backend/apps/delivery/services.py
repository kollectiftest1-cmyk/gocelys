import random

from django.db import transaction
from django.utils import timezone

from apps.core import audit
from apps.core.api import BusinessError
from apps.core.models import Sequence
from apps.finance.models import PaymentMethod
from apps.orders import services as orders
from apps.orders.models import Order

from .models import Delivery, Driver

DS = Delivery.Status
OS = Order.Status


def _otp():
    return "".join(random.choice("0123456789") for _ in range(4))


@transaction.atomic
def assign(order, driver, user):
    """Affecte (ou réaffecte) un livreur à une commande prête."""
    if order.fulfillment != Order.Fulfillment.DELIVERY:
        raise BusinessError("Cette commande est un retrait en agence.")
    if driver.agency_id != order.agency_id:
        raise BusinessError("Le livreur doit appartenir à l'agence de la commande.")
    if not driver.is_active:
        raise BusinessError("Ce livreur est désactivé.")
    delivery = Delivery.objects.filter(order=order).first()
    if delivery and delivery.status in (DS.PICKED_UP, DS.EN_ROUTE, DS.DELIVERED):
        raise BusinessError("La livraison est déjà en cours : réaffectation impossible.")
    if delivery is None:
        delivery = Delivery(order=order, agency=order.agency, reference=Sequence.next("LIV", order.agency.code, order.created_at),
                            zone=order.zone, fee=order.delivery_fee, otp_code=_otp())
    delivery.driver, delivery.status, delivery.assigned_at = driver, DS.ASSIGNED, timezone.now()
    delivery.save()
    if order.status == OS.READY:
        orders.transition(order, OS.DRIVER_ASSIGNED, user=user, note=f"Livreur : {driver}")
    from apps.notifications.services import notify_user

    notify_user(driver.user, kind="delivery_assigned", title="Nouvelle livraison",
                body=f"{order.reference} — {order.customer.name}, {order.address_text}", link=f"delivery/{delivery.pk}")
    audit.log(user, "delivery.assign", "order", order, after={"livreur": str(driver)})
    return delivery


def _own(delivery, user):
    if delivery.driver is None or delivery.driver.user_id != user.pk:
        raise BusinessError("Cette livraison ne vous est pas attribuée.", code="forbidden")


@transaction.atomic
def driver_update(delivery, user, status, note="", latitude=None, longitude=None):
    delivery = Delivery.objects.select_for_update().select_related("order", "driver").get(pk=delivery.pk)
    _own(delivery, user)
    flow = {
        DS.ASSIGNED: {DS.ACCEPTED},
        DS.ACCEPTED: {DS.PICKED_UP, DS.FAILED},
        DS.PICKED_UP: {DS.EN_ROUTE, DS.FAILED},
        DS.EN_ROUTE: {DS.FAILED},
    }
    if status not in flow.get(delivery.status, set()):
        raise BusinessError(f"Étape impossible depuis « {delivery.get_status_display()} ».")
    now = timezone.now()
    delivery.status = status
    if status == DS.ACCEPTED:
        delivery.accepted_at = now
    if status in (DS.PICKED_UP,):
        delivery.departed_at = now
        if delivery.order.status == OS.DRIVER_ASSIGNED:
            orders.transition(delivery.order, OS.IN_DELIVERY, user=user, note="Colis récupéré par le livreur")
    if status == DS.FAILED:
        delivery.failure_reason = note or "Non précisé"
        if delivery.order.status == OS.DRIVER_ASSIGNED:
            orders.transition(delivery.order, OS.IN_DELIVERY, user=user)
        orders.transition(delivery.order, OS.FAILED, user=user, note=note)
    delivery.save()
    if latitude is not None and longitude is not None:
        d = delivery.driver
        d.last_latitude, d.last_longitude, d.last_seen_at = latitude, longitude, now
        d.save(update_fields=["last_latitude", "last_longitude", "last_seen_at"])
    return delivery


@transaction.atomic
def confirm(delivery, user, *, method, otp=None, photo=None, signature="", note="", cash_collected=None):
    """Preuve de livraison : code OTP, photo, signature ou confirmation livreur."""
    delivery = Delivery.objects.select_for_update().select_related("order").get(pk=delivery.pk)
    _own(delivery, user)
    if delivery.status not in (DS.PICKED_UP, DS.EN_ROUTE, DS.ACCEPTED):
        raise BusinessError("Cette livraison ne peut pas être confirmée à cette étape.")
    if method == "otp" and (otp or "").strip() != delivery.otp_code:
        raise BusinessError("Code de confirmation incorrect. Demandez au client le code reçu.", code="bad_otp")
    if method == "photo" and not photo:
        raise BusinessError("Ajoutez la photo de preuve.")
    if method == "signature" and not signature:
        raise BusinessError("La signature du client est requise.")
    delivery.proof_method, delivery.proof_note = method, note
    if photo:
        delivery.proof_photo = photo
    delivery.proof_signature = signature
    delivery.status, delivery.arrived_at = DS.DELIVERED, timezone.now()
    order = delivery.order
    if order.status == OS.DRIVER_ASSIGNED:
        orders.transition(order, OS.IN_DELIVERY, user=user)
        order.refresh_from_db()
    if order.payment_status != Order.PaymentStatus.PAID:
        delivery.cash_collected = cash_collected if cash_collected is not None else order.total
        cash = PaymentMethod.objects.filter(kind=PaymentMethod.Kind.CASH).first()
        orders.mark_paid(order, user, method=order.payment_method or cash, reference=f"Livraison {delivery.reference}")
    delivery.save()
    orders.transition(order, OS.DELIVERED, user=user, note=f"Preuve : {method}")
    orders.transition(order, OS.COMPLETED, user=user)
    audit.log(user, "delivery.confirm", "order", order, after={"preuve": method})
    return delivery
