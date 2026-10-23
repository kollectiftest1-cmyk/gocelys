"""Règles du POS et des caisses. Utilisé par l'API en ligne ET par la synchronisation hors ligne."""
import uuid
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.core.utils import fmt_money
from apps.catalog.models import Product, ProductUnit, Promotion
from apps.core import audit
from apps.core.api import BusinessError
from apps.core.models import Sequence, Setting
from apps.finance import services as finance
from apps.finance.models import FinancialTransaction, PaymentMethod
from apps.inventory import services as stock
from apps.inventory.models import Bucket, MovementKind

from .models import CashSession, Sale, SaleLine, SalePayment, SyncOperation

D = Decimal


def _dt(value):
    if not value:
        return timezone.now()
    if hasattr(value, "tzinfo"):
        return value
    parsed = parse_datetime(str(value))
    if parsed and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed or timezone.now()


# --------------------------------------------------------------------------- sessions
def resolve_pos(user, pos=None):
    """
    Caisse sur laquelle l'utilisateur ouvre sa session.
    Un caissier travaille sur la caisse qui lui est affectée ; seul un responsable habilité
    (cash.validate) peut ouvrir une autre caisse de son agence, par exemple pour remplacer quelqu'un.
    """
    assigned = user.assigned_pos
    if pos is None or (assigned and pos.pk == assigned.pk):
        if assigned is None:
            raise BusinessError("Vous n'êtes affecté à aucune caisse. Demandez à votre responsable de vous en attribuer une.",
                                code="no_pos")
        return assigned
    if not user.has_code("cash.validate", pos.agency_id):
        raise BusinessError(f"Vous êtes affecté à {assigned.name if assigned else 'aucune caisse'} : vous ne pouvez pas ouvrir {pos.name}.",
                            code="pos_forbidden")
    return pos


@transaction.atomic
def open_session(*, pos, user, opening_float=None, opened_at=None, client_uuid=None):
    if client_uuid:
        existing = CashSession.objects.filter(client_uuid=client_uuid).first()
        if existing:
            return existing
    if not pos.is_active or not pos.agency.is_operational:
        raise BusinessError("Ce point de vente ou son agence n'est pas actif.")
    current = CashSession.objects.select_for_update().filter(pos=pos, status=CashSession.Status.OPEN).first()
    if current:
        if current.cashier_id == user.pk:
            return current
        raise BusinessError(f"La caisse {pos.name} est déjà ouverte par {current.cashier}.", code="session_already_open")
    if opening_float in (None, ""):
        opening_float = pos.default_float
    session = CashSession.objects.create(
        reference=Sequence.next("CAI", pos.agency.code, _dt(opened_at)), pos=pos, agency=pos.agency, cashier=user,
        opening_float=D(str(opening_float or 0)), opened_at=_dt(opened_at), client_uuid=client_uuid,
    )
    audit.log(user, "cash.open", "cash_session", session, after={"fonds_initial": float(session.opening_float)})
    return session


def session_figures(session):
    """Solde théorique espèces = fonds initial + entrées espèces − sorties espèces."""
    txs = FinancialTransaction.objects.filter(cash_session=session)
    cash = txs.filter(method__kind=PaymentMethod.Kind.CASH)
    cash_in = cash.filter(direction="in").aggregate(s=Sum("amount"))["s"] or D(0)
    cash_out = cash.filter(direction="out").aggregate(s=Sum("amount"))["s"] or D(0)
    by_method = {}
    for row in txs.values("method__name", "method__kind", "direction").annotate(total=Sum("amount")):
        key = row["method__name"] or "—"
        sign = 1 if row["direction"] == "in" else -1
        by_method.setdefault(key, {"name": key, "kind": row["method__kind"], "total": D(0)})
        by_method[key]["total"] += sign * row["total"]
    sales = session.sales.filter(status__in=[Sale.Status.COMPLETED, Sale.Status.PARTIAL_REFUND])
    return {
        "opening_float": session.opening_float,
        "cash_in": cash_in,
        "cash_out": cash_out,
        "expected_cash": session.opening_float + cash_in - cash_out,
        "sales_count": sales.count(),
        "sales_total": sales.aggregate(s=Sum("total"))["s"] or D(0),
        "cancelled_count": session.sales.filter(status=Sale.Status.CANCELLED).count(),
        "by_method": [{**v, "total": float(v["total"])} for v in by_method.values()],
    }


@transaction.atomic
def close_session(session, *, user, counted_cash, count_detail=None, justification="", closed_at=None):
    session = CashSession.objects.select_for_update().get(pk=session.pk)
    if session.status != CashSession.Status.OPEN:
        raise BusinessError("Cette session de caisse est déjà clôturée.")
    if session.cashier_id != user.pk and not user.has_code("cash.validate", session.agency_id):
        raise BusinessError("Seul le caissier ou un responsable peut clôturer cette caisse.")
    figures = session_figures(session)
    session.expected_cash = figures["expected_cash"]
    session.counted_cash = D(counted_cash)
    session.difference = session.counted_cash - session.expected_cash
    session.count_detail = count_detail or {}
    session.justification = justification
    session.closed_at = _dt(closed_at)
    session.status = CashSession.Status.CLOSED
    if session.difference != 0 and not justification:
        raise BusinessError(
            f"Écart de {fmt_money(session.difference, session.currency)} : une justification est obligatoire.",
            code="justification_required", difference=float(session.difference),
        )
    session.save()
    audit.log(user, "cash.close", "cash_session", session, after={
        "théorique": float(session.expected_cash), "compté": float(session.counted_cash),
        "écart": float(session.difference)}, note=justification)
    threshold = D(str(Setting.get("cash_difference_alert", 5000)))
    if abs(session.difference) >= threshold:
        from apps.notifications.services import notify_perm

        notify_perm("cash.validate", session.agency, kind="cash_gap", level="danger",
                    title=f"Écart de caisse — {session.pos.name}",
                    body=f"{'+' if session.difference > 0 else ''}{fmt_money(session.difference, session.currency)} à {session.agency.name} ({session.cashier}).",
                    link=f"/caisses/{session.pk}")
    return session


@transaction.atomic
def validate_session(session, user, note=""):
    if session.status != CashSession.Status.CLOSED:
        raise BusinessError("Seule une caisse clôturée peut être validée.")
    session.status, session.validated_by, session.validated_at = CashSession.Status.VALIDATED, user, timezone.now()
    if note:
        session.justification = (session.justification + "\n[Validation] " + note).strip()
    session.save()
    audit.log(user, "cash.validate", "cash_session", session, note=note)
    return session


@transaction.atomic
def cash_movement(session, *, user, direction, amount, label):
    if session.status != CashSession.Status.OPEN:
        raise BusinessError("La caisse doit être ouverte.")
    cash = PaymentMethod.objects.filter(kind=PaymentMethod.Kind.CASH).first()
    return finance.record(
        direction=direction, source="cash_in" if direction == "in" else "cash_out", amount=amount,
        agency=session.agency, method=cash, user=user, label=label, cash_session=session,
        category_code="apport-caisse" if direction == "in" else "retrait-caisse",
    )


# --------------------------------------------------------------------------- ventes
def _resolve_line(raw):
    product = Product.objects.filter(pk=raw.get("product")).first() if raw.get("product") else None
    pu = None
    if raw.get("product_unit"):
        pu = ProductUnit.objects.select_related("product", "unit").filter(pk=raw["product_unit"]).first()
        if pu is None:
            raise BusinessError("Conditionnement introuvable.")
        product = pu.product
    if product is None:
        raise BusinessError("Produit introuvable.")
    qty = D(str(raw.get("quantity", 0)))
    if qty <= 0:
        raise BusinessError(f"Quantité invalide pour « {product.name} ».")
    factor = pu.factor if pu else D(1)
    if raw.get("unit_price") is not None:
        price = D(str(raw["unit_price"]))
    else:
        price = pu.current_price() if pu else product.current_price()
    discount = D(str(raw.get("discount", 0) or 0))
    label = f"{product.name} — {pu.unit.name}" if pu and pu.factor != 1 else product.name
    return {"product": product, "pu": pu, "qty": qty, "factor": factor, "price": price,
            "discount": discount, "label": label, "total": qty * price - discount}


@transaction.atomic
def create_sale(*, user, session, lines, payments, client_uuid=None, discount=0, discount_reason="",
                promo_code=None, customer=None, occurred_at=None, offline=False, offline_reference=""):
    """
    Enregistre une vente POS : lignes, stock (disponible → sorti), paiements (→ finances).
    Idempotente sur client_uuid : un renvoi renvoie la même vente.
    """
    client_uuid = client_uuid or uuid.uuid4()
    existing = Sale.objects.filter(client_uuid=client_uuid).first()
    if existing:
        return existing, False
    if session.status != CashSession.Status.OPEN and not offline:
        raise BusinessError("Ouvrez une session de caisse avant d'encaisser.", code="session_closed")
    if not lines:
        raise BusinessError("Le panier est vide.")
    resolved = [_resolve_line(raw) for raw in lines]
    manual_price = any(raw.get("unit_price") is not None for raw in lines)
    line_discounts = sum((r["discount"] for r in resolved), D(0))
    discount = D(str(discount or 0))
    if (discount > 0 or line_discounts > 0 or manual_price) and not user.has_code("sales.discount", session.agency_id):
        raise BusinessError("Vous n'êtes pas autorisé à accorder une remise ou modifier un prix.", code="discount_forbidden")
    subtotal = sum((r["qty"] * r["price"] for r in resolved), D(0))
    promotion = None
    if promo_code:
        promotion = Promotion.objects.filter(code__iexact=promo_code).first()
        if promotion:
            discount += promotion.discount_for(subtotal - line_discounts - discount)
            promotion.used += 1
            promotion.save(update_fields=["used"])
    total = subtotal - line_discounts - discount
    if total < 0:
        raise BusinessError("La remise dépasse le montant de la vente.")
    paid = sum((D(str(p["amount"])) for p in payments), D(0))
    if paid < total:
        raise BusinessError(f"Montant encaissé insuffisant : {fmt_money(paid)} sur {fmt_money(total)}.", code="underpaid")
    when = _dt(occurred_at)
    sale = Sale.objects.create(
        reference=Sequence.next("VTE", session.agency.code, when), client_uuid=client_uuid, agency=session.agency,
        pos=session.pos, session=session, cashier=user, customer=customer, currency=session.currency,
        subtotal=subtotal, discount=discount + line_discounts, discount_reason=discount_reason,
        promotion=promotion, total=total, paid=paid, change_due=paid - total, occurred_at=when,
        created_offline=offline, offline_reference=offline_reference,
    )
    for r in resolved:
        base_qty = r["qty"] * r["factor"]
        SaleLine.objects.create(sale=sale, product=r["product"], product_unit=r["pu"], label=r["label"],
                                quantity=r["qty"], factor=r["factor"], base_quantity=base_qty,
                                unit_price=r["price"], discount=r["discount"], total=r["total"])
        # Hors ligne, la vente a déjà eu lieu : on l'accepte même si le stock passe en négatif (alerte).
        stock.record(agency=session.agency, product=r["product"], bucket=Bucket.AVAILABLE, delta=-base_qty,
                     kind=MovementKind.SALE, reference=sale.reference, user=user, source=sale,
                     occurred_at=when, allow_negative=offline)
    # Les espèces rendues réduisent l'encaissement espèces.
    change = paid - total
    for p in payments:
        method = PaymentMethod.objects.filter(Q(pk=p.get("method")) if str(p.get("method", "")).isdigit() else Q(code=p.get("method"))).first()
        if method is None:
            raise BusinessError("Moyen de paiement inconnu.")
        amount = D(str(p["amount"]))
        if method.kind == PaymentMethod.Kind.CASH and change > 0:
            deduct = min(change, amount)
            amount -= deduct
            change -= deduct
        if method.requires_reference and not p.get("reference") and not offline:
            raise BusinessError(f"Référence obligatoire pour un paiement {method.name}.")
        tx = None
        if amount > 0:
            tx = finance.record(direction="in", source=FinancialTransaction.Source.SALE, amount=amount,
                                currency=sale.currency, agency=sale.agency, method=method, user=user,
                                label=f"Vente {sale.reference}", category_code="ventes", cash_session=session,
                                source_id=sale.pk, external_reference=p.get("reference", ""), occurred_at=when)
        SalePayment.objects.create(sale=sale, method=method, amount=amount, reference=p.get("reference", ""), transaction=tx)
    if customer is not None:
        per = D(str(Setting.get("loyalty_points_per", 1000)))
        customer.loyalty_points += int(total // per) if per else 0
        customer.save(update_fields=["loyalty_points"])
    _check_low_stock(sale)
    return sale, True


def _check_low_stock(sale):
    from apps.notifications.services import low_stock_alert

    for line in sale.lines.select_related("product"):
        low_stock_alert(sale.agency, line.product)


@transaction.atomic
def cancel_sale(sale, *, user, reason, refund=False):
    """Annulation (même session) ou remboursement : remet le stock et inverse les encaissements."""
    sale = Sale.objects.select_for_update().get(pk=sale.pk)
    code = "sales.refund" if refund else "sales.cancel"
    if not user.has_code(code, sale.agency_id):
        raise BusinessError("Permission requise pour annuler ou rembourser une vente.", code="forbidden")
    if sale.status not in (Sale.Status.COMPLETED,):
        raise BusinessError("Cette vente est déjà annulée ou remboursée.")
    if not reason:
        raise BusinessError("Le motif est obligatoire.")
    for line in sale.lines.select_related("product"):
        stock.record(agency=sale.agency, product=line.product, bucket=Bucket.AVAILABLE, delta=line.base_quantity,
                     kind=MovementKind.RETURN if refund else MovementKind.SALE_CANCEL, reference=sale.reference,
                     user=user, source=sale, reason=reason)
        line.refunded_quantity = line.quantity
        line.save(update_fields=["refunded_quantity"])
    session = CashSession.objects.filter(cashier=user, status=CashSession.Status.OPEN, agency=sale.agency).first() or sale.session
    for payment in sale.payments.select_related("method"):
        if payment.amount > 0:
            finance.record(direction="out", source=FinancialTransaction.Source.SALE_REFUND, amount=payment.amount,
                           currency=sale.currency, agency=sale.agency, method=payment.method, user=user,
                           label=f"{'Remboursement' if refund else 'Annulation'} {sale.reference}",
                           category_code="ventes", cash_session=session if session.status == "open" else None,
                           source_id=sale.pk)
    sale.status = Sale.Status.REFUNDED if refund else Sale.Status.CANCELLED
    sale.cancelled_by, sale.cancelled_at, sale.cancel_reason = user, timezone.now(), reason
    sale.save()
    audit.log(user, "sale.refund" if refund else "sale.cancel", "refund" if refund else "sale", sale,
              before={"statut": "encaissée", "total": float(sale.total)}, after={"statut": sale.status}, note=reason)
    return sale


# --------------------------------------------------------------------------- synchronisation
def apply_operation(op, *, user, device_id):
    """
    Applique une opération remontée par un POS hors ligne. Idempotent sur op_id.
    Types : session.open, sale.create, session.close, cash.movement.
    """
    op_id = op.get("op_id")
    kind = op.get("type")
    payload = op.get("payload") or {}
    done = SyncOperation.objects.filter(op_id=op_id).first()
    if done:
        return {"op_id": op_id, "status": "duplicate", "result": done.result, "error": done.error}
    try:
        with transaction.atomic():
            result = _apply(kind, payload, user=user, occurred_at=op.get("occurred_at"))
            SyncOperation.objects.create(op_id=op_id, device_id=device_id, kind=kind, user=user, payload=payload,
                                         status=SyncOperation.Status.APPLIED, result=result,
                                         occurred_at=_dt(op.get("occurred_at")))
        return {"op_id": op_id, "status": "applied", "result": result}
    except IntegrityError:
        done = SyncOperation.objects.filter(op_id=op_id).first()
        return {"op_id": op_id, "status": "duplicate", "result": done.result if done else {}}
    except BusinessError as exc:
        SyncOperation.objects.create(op_id=op_id, device_id=device_id, kind=kind, user=user, payload=payload,
                                     status=SyncOperation.Status.REJECTED, error=str(exc.detail),
                                     occurred_at=_dt(op.get("occurred_at")))
        return {"op_id": op_id, "status": "rejected", "error": str(exc.detail)}


def _session_from(payload, user):
    from apps.agencies.models import PointOfSale

    ref = payload.get("session_uuid")
    session = CashSession.objects.filter(client_uuid=ref).first() if ref else None
    if session is None and payload.get("session"):
        session = CashSession.objects.filter(pk=payload["session"]).first()
    if session is None and payload.get("pos"):
        pos = PointOfSale.objects.get(pk=payload["pos"])
        session = CashSession.objects.filter(pos=pos, status=CashSession.Status.OPEN).first()
    if session is None:
        raise BusinessError("Session de caisse introuvable pour cette opération.")
    return session


def _apply(kind, payload, *, user, occurred_at):
    from apps.agencies.models import PointOfSale
    from apps.core.api import require

    if kind == "session.open":
        pos = PointOfSale.objects.select_related("agency").filter(pk=payload.get("pos")).first() if payload.get("pos") else None
        pos = resolve_pos(user, pos)
        require(user, "cash.operate", pos.agency)
        session = open_session(pos=pos, user=user, opening_float=payload.get("opening_float", 0),
                               opened_at=occurred_at, client_uuid=payload.get("session_uuid"))
        return {"session": session.pk, "reference": session.reference}
    if kind == "sale.create":
        session = _session_from(payload, user)
        require(user, "sales.create", session.agency)
        customer = None
        if payload.get("customer"):
            from apps.orders.models import Customer

            customer = Customer.objects.filter(pk=payload["customer"]).first()
        sale, created = create_sale(
            user=user, session=session, lines=payload["lines"], payments=payload["payments"],
            client_uuid=payload["client_uuid"], discount=payload.get("discount", 0),
            discount_reason=payload.get("discount_reason", ""), promo_code=payload.get("promo_code"),
            customer=customer, occurred_at=occurred_at, offline=True,
            offline_reference=payload.get("offline_reference", ""),
        )
        return {"sale": sale.pk, "reference": sale.reference, "created": created}
    if kind == "session.close":
        session = _session_from(payload, user)
        session = close_session(session, user=user, counted_cash=payload["counted_cash"],
                                count_detail=payload.get("count_detail"),
                                justification=payload.get("justification", ""), closed_at=occurred_at)
        return {"session": session.pk, "difference": float(session.difference)}
    if kind == "cash.movement":
        session = _session_from(payload, user)
        tx = cash_movement(session, user=user, direction=payload["direction"], amount=payload["amount"],
                           label=payload.get("label", "Mouvement de caisse"))
        return {"transaction": tx.pk}
    raise BusinessError(f"Type d'opération inconnu : {kind}")
