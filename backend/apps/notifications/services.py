"""
Notifications internes + alertes automatiques (cahier des charges §28).

Les envois push (Expo), SMS et WhatsApp passent par `OutboundMessage` : le
fournisseur réel se branche dans `dispatch_outbound` une fois choisi.
"""
import json
import logging
import urllib.request
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.core.utils import fmt_money, fmt_qty

from .models import Notification, OutboundMessage, PushDevice

logger = logging.getLogger("gocelsys")


def notify_user(user, *, kind="info", title, body="", level="info", link="", agency=None, dedupe_key="", push=True):
    if user is None:
        return None
    if dedupe_key and Notification.objects.filter(user=user, dedupe_key=dedupe_key, read_at__isnull=True).exists():
        return None
    n = Notification.objects.create(user=user, kind=kind, title=title[:160], body=body[:500], level=level,
                                    link=link, agency=agency, dedupe_key=dedupe_key)
    if push:
        for device in PushDevice.objects.filter(user=user, is_active=True):
            OutboundMessage.objects.create(channel="push", to=device.token,
                                           body=json.dumps({"title": title, "body": body, "data": {"link": link}}))
    return n


def users_with(code, agency=None):
    from apps.accounts.models import User

    users = []
    for user in User.objects.filter(is_active=True, kind="staff").prefetch_related("role_assignments__role"):
        if agency is not None:
            ok = user.has_code(code, agency.pk) and (user.agency_ids(code) is None or agency.pk in user.agency_ids(code))
        else:
            ok = user.has_code(code)
        if ok:
            users.append(user)
    return users


def notify_perm(code, agency, *, kind, title, body="", level="info", link="", dedupe_key=""):
    """Prévient toutes les personnes ayant la permission `code` sur l'agence."""
    return [notify_user(u, kind=kind, title=title, body=body, level=level, link=link, agency=agency,
                        dedupe_key=dedupe_key) for u in users_with(code, agency)]


def notify_customer(customer, *, title, body, link=""):
    if customer.user_id:
        notify_user(customer.user, kind="order", title=title, body=body, link=link)
    elif customer.phone:
        OutboundMessage.objects.create(channel="sms", to=customer.phone, body=f"Gocelsys : {body}")


def low_stock_alert(agency, product):
    from apps.inventory.services import quantity

    qty = quantity(agency, product)
    if product.min_stock and qty <= product.min_stock:
        rupture = qty <= 0
        notify_perm(
            "stock.view", agency, kind="stock_out" if rupture else "stock_low",
            level="danger" if rupture else "warning",
            title=f"{'Rupture' if rupture else 'Stock faible'} — {product.name}",
            body=f"{agency.name} : {fmt_qty(qty)} restant(s), seuil {fmt_qty(product.min_stock)}.",
            link=f"/stocks?agence={agency.pk}&produit={product.pk}",
            dedupe_key=f"stock:{agency.pk}:{product.pk}:{'out' if rupture else 'low'}",
        )


def run_alerts():
    """Balayage périodique (cron / tâche planifiée toutes les 15 min) : `manage.py run_alerts`."""
    from apps.agencies.models import Agency
    from apps.catalog.models import Product
    from apps.core.models import Setting
    from apps.delivery.models import Delivery
    from apps.finance import services as finance
    from apps.finance.models import Due
    from apps.inventory.models import Transfer
    from apps.sales.models import CashSession

    now = timezone.now()
    count = 0
    for agency in Agency.objects.filter(status=Agency.Status.ACTIVE):
        for product in Product.objects.filter(status=Product.Status.ACTIVE, min_stock__gt=0):
            low_stock_alert(agency, product)
    max_hours = int(Setting.get("session_max_hours", 14))
    for s in CashSession.objects.filter(status="open", opened_at__lt=now - timedelta(hours=max_hours)).select_related("agency", "pos"):
        notify_perm("cash.validate", s.agency, kind="cash_unclosed", level="warning",
                    title=f"Caisse non clôturée — {s.pos.name}",
                    body=f"Ouverte depuis le {timezone.localtime(s.opened_at):%d/%m %H:%M} par {s.cashier}.",
                    link=f"/caisses/{s.pk}", dedupe_key=f"cash_unclosed:{s.pk}")
        count += 1
    late = int(Setting.get("delivery_late_minutes", 90))
    for d in Delivery.objects.filter(status__in=["assigned", "accepted", "picked_up", "en_route"],
                                     assigned_at__lt=now - timedelta(minutes=late)).select_related("agency", "order"):
        notify_perm("deliveries.manage", d.agency, kind="delivery_late", level="warning",
                    title=f"Livraison en retard — {d.order.reference}", body=f"Affectée à {d.driver}.",
                    link=f"/livraisons?ref={d.reference}", dedupe_key=f"delivery_late:{d.pk}")
        count += 1
    for t in Transfer.objects.filter(status__in=["requested", "shipped"], created_at__lt=now - timedelta(hours=24)).select_related("source", "destination"):
        target, code = (t.source, "transfers.validate") if t.status == "requested" else (t.destination, "transfers.receive")
        notify_perm(code, target, kind="transfer_pending", level="warning",
                    title=f"Transfert en attente — {t.reference}",
                    body=f"{t.source.name} → {t.destination.name} : {t.get_status_display().lower()}.",
                    link=f"/transferts/{t.pk}", dedupe_key=f"transfer:{t.pk}:{t.status}")
    finance.generate_dues()
    today = timezone.localdate()
    for due in Due.objects.filter(status="due_soon", reminded_at__isnull=True).select_related("charge__agency"):
        days = (due.due_date - today).days
        notify_perm("charges.manage", due.charge.agency, kind="due_soon", level="warning",
                    title=f"Échéance dans {days} jour{'s' if days > 1 else ''}",
                    body=f"{due.charge.name} — {fmt_money(due.amount, due.currency)}, le {due.due_date:%d/%m}.",
                    link="/finances/echeances", dedupe_key=f"due_soon:{due.pk}")
        notify_perm("finance.view", due.charge.agency, kind="due_soon", level="warning",
                    title=f"Échéance dans {days} jour{'s' if days > 1 else ''}",
                    body=f"{due.charge.name} — {fmt_money(due.amount, due.currency)}.", link="/finances/echeances",
                    dedupe_key=f"due_soon:{due.pk}")
        due.reminded_at = now
        due.save(update_fields=["reminded_at"])
    for due in Due.objects.filter(status="overdue", overdue_notified_at__isnull=True).select_related("charge__agency"):
        for code in ("charges.manage", "finance.view"):
            notify_perm(code, due.charge.agency, kind="due_overdue", level="danger",
                        title="Charge échue", body=f"{due.charge.name} — {fmt_money(due.amount, due.currency)}.",
                        link="/finances/echeances", dedupe_key=f"due_overdue:{due.pk}")
        due.overdue_notified_at = now
        due.save(update_fields=["overdue_notified_at"])
    dispatch_outbound()
    return count


def dispatch_outbound(limit=100):
    """Envoie les messages en file. Push Expo branché ; SMS/WhatsApp à connecter au fournisseur choisi."""
    for msg in OutboundMessage.objects.filter(status="queued").order_by("created_at")[:limit]:
        try:
            if msg.channel == "push":
                payload = json.loads(msg.body)
                payload["to"] = msg.to
                req = urllib.request.Request("https://exp.host/--/api/v2/push/send", data=json.dumps(payload).encode(),
                                             headers={"Content-Type": "application/json"})
                urllib.request.urlopen(req, timeout=5)
                msg.status = "sent"
            else:
                logger.info("[%s] → %s : %s", msg.channel, msg.to, msg.body)
                msg.status = "logged"
            msg.sent_at = timezone.now()
        except Exception as exc:  # réseau indisponible : on réessaiera
            msg.error = str(exc)[:500]
        msg.save()


def unread_for(user):
    return Notification.objects.filter(Q(user=user), read_at__isnull=True)
