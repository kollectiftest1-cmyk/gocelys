"""Tableau de bord direction (§27) et rapports (§26) avec export CSV."""
import csv
from datetime import date, timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.agencies.models import Agency
from apps.core.api import require
from apps.delivery.models import Delivery
from apps.finance import services as finance
from apps.finance.models import Due, Expense, FinancialTransaction
from apps.inventory.models import StockBalance, StockMovement
from apps.notifications.models import Notification
from apps.orders.models import Order, OrderLine
from apps.sales.models import CashSession, Sale, SaleLine

DONE_SALE = ["completed", "partial_refund"]


def period(params):
    today = timezone.localdate()
    p = params.get("period", "today")
    if params.get("since"):
        since = date.fromisoformat(params["since"])
        until = date.fromisoformat(params.get("until") or today.isoformat())
    elif p == "today":
        since = until = today
    elif p == "yesterday":
        since = until = today - timedelta(days=1)
    elif p == "7d":
        since, until = today - timedelta(days=6), today
    elif p == "30d":
        since, until = today - timedelta(days=29), today
    elif p == "month":
        since, until = today.replace(day=1), today
    elif p == "year":
        since, until = today.replace(month=1, day=1), today
    else:
        raise ValidationError({"period": "Période inconnue."})
    return since, until


def scope(request, code):
    require(request.user, code)
    ids = request.user.agency_ids(code)
    agency = request.query_params.get("agency")
    if agency:
        agency = int(agency)
        if ids is not None and agency not in ids:
            raise ValidationError({"agency": "Agence hors de votre périmètre."})
        return {agency}
    return ids


def _f(qs, ids, field="agency"):
    return qs if ids is None else qs.filter(**{f"{field}__in": ids})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    ids = scope(request, "dashboard.view")
    since, until = period(request.query_params)
    category = request.query_params.get("category")
    product = request.query_params.get("product")
    today = timezone.localdate()

    sales = _f(Sale.objects.filter(status__in=DONE_SALE, occurred_at__date__gte=since, occurred_at__date__lte=until), ids)
    orders_done = _f(Order.objects.filter(status="completed", delivered_at__date__gte=since, delivered_at__date__lte=until), ids)
    sale_lines = SaleLine.objects.filter(sale__in=sales)
    order_lines = OrderLine.objects.filter(order__in=orders_done)
    if category:
        sale_lines = sale_lines.filter(Q(product__category=category) | Q(product__category__parent=category))
        order_lines = order_lines.filter(Q(product__category=category) | Q(product__category__parent=category))
    if product:
        sale_lines = sale_lines.filter(product=product)
        order_lines = order_lines.filter(product=product)
    filtered = bool(category or product)
    pos_amount = float((sale_lines.aggregate(s=Sum("total"))["s"] if filtered else sales.aggregate(s=Sum("total"))["s"]) or 0)
    order_amount = float((order_lines.aggregate(s=Sum("total"))["s"] if filtered else orders_done.aggregate(s=Sum("total"))["s"]) or 0)

    # Période précédente de même durée, pour la tendance
    span = (until - since).days + 1
    prev_since, prev_until = since - timedelta(days=span), since - timedelta(days=1)
    prev_sales = _f(Sale.objects.filter(status__in=DONE_SALE, occurred_at__date__gte=prev_since, occurred_at__date__lte=prev_until), ids)
    prev_orders = _f(Order.objects.filter(status="completed", delivered_at__date__gte=prev_since, delivered_at__date__lte=prev_until), ids)
    prev_amount = float(prev_sales.aggregate(s=Sum("total"))["s"] or 0) + float(prev_orders.aggregate(s=Sum("total"))["s"] or 0)

    orders_new = _f(Order.objects.filter(created_at__date__gte=since, created_at__date__lte=until).exclude(status="draft"), ids)
    orders_open = _f(Order.objects.filter(status__in=["confirmed", "accepted", "preparing", "ready", "driver_assigned", "in_delivery"]), ids)
    deliveries = _f(Delivery.objects.all(), ids)
    delivered = deliveries.filter(status="delivered", arrived_at__date__gte=since, arrived_at__date__lte=until)
    late_limit = timezone.now() - timedelta(minutes=90)
    in_progress = deliveries.filter(status__in=["assigned", "accepted", "picked_up", "en_route"])
    expenses = _f(Expense.objects.filter(spent_on__gte=since, spent_on__lte=until).exclude(status__in=["rejected", "draft"]), ids)
    expenses_amount = sum(float(finance.to_cdf(e.amount, e.currency)) for e in expenses)
    dues = _f(Due.objects.exclude(status__in=["paid", "cancelled"]).filter(due_date__lte=today + timedelta(days=30)), ids, "charge__agency")
    agencies = Agency.objects.all() if ids is None else Agency.objects.filter(pk__in=ids)
    sessions = _f(CashSession.objects.filter(status="open").select_related("pos", "cashier", "agency"), ids)

    low, out = [], 0
    for b in _f(StockBalance.objects.filter(bucket="available").select_related("product", "agency"), ids):
        if b.product.status == "active" and b.product.min_stock and b.quantity <= b.product.min_stock:
            if b.quantity <= 0:
                out += 1
            low.append({"agency": b.agency.name, "product": b.product.name, "quantity": float(b.quantity),
                        "min": float(b.product.min_stock), "unit": b.product.base_unit.name})
    low.sort(key=lambda r: r["quantity"] / (r["min"] or 1))

    # Série journalière (au moins 14 jours pour un graphique lisible)
    chart_since = min(since, until - timedelta(days=13))
    days = [(chart_since + timedelta(days=i)) for i in range((until - chart_since).days + 1)]
    pos_by_day = {r["d"]: float(r["t"]) for r in _f(Sale.objects.filter(status__in=DONE_SALE, occurred_at__date__gte=chart_since, occurred_at__date__lte=until), ids)
                  .annotate(d=TruncDate("occurred_at")).values("d").annotate(t=Sum("total"))}
    ord_by_day = {r["d"]: float(r["t"]) for r in _f(Order.objects.filter(status="completed", delivered_at__date__gte=chart_since, delivered_at__date__lte=until), ids)
                  .annotate(d=TruncDate("delivered_at")).values("d").annotate(t=Sum("total"))}
    series = [{"day": d.isoformat(), "pos": pos_by_day.get(d, 0), "orders": ord_by_day.get(d, 0)} for d in days]

    by_agency = []
    for a in agencies.exclude(status="closed"):
        s = float(sales.filter(agency=a).aggregate(t=Sum("total"))["t"] or 0)
        o = float(orders_done.filter(agency=a).aggregate(t=Sum("total"))["t"] or 0)
        by_agency.append({"id": a.id, "name": a.name, "code": a.code, "color": a.color, "pos": s, "orders": o, "total": s + o,
                          "status": a.status})
    by_agency.sort(key=lambda r: -r["total"])

    top = {}
    for r in sale_lines.values("product", "product__name").annotate(q=Sum("base_quantity"), t=Sum("total")):
        top[r["product"]] = {"product": r["product__name"], "quantity": float(r["q"]), "total": float(r["t"])}
    for r in order_lines.values("product", "product__name").annotate(q=Sum("base_quantity"), t=Sum("total")):
        row = top.setdefault(r["product"], {"product": r["product__name"], "quantity": 0, "total": 0})
        row["quantity"] += float(r["q"])
        row["total"] += float(r["t"])
    top_products = sorted(top.values(), key=lambda r: -r["total"])[:8]

    methods = [{"method": r["method__name"] or "—", "kind": r["method__kind"], "total": float(r["t"])}
               for r in _f(FinancialTransaction.objects.filter(direction="in", occurred_at__date__gte=since, occurred_at__date__lte=until), ids)
               .values("method__name", "method__kind").annotate(t=Sum("amount_cdf")).order_by("-t")]

    recent_orders = [{"id": o.id, "reference": o.reference, "customer": o.customer.name, "agency": o.agency.name if o.agency_id else "",
                      "total": float(o.total), "status": o.status, "status_label": o.get_status_display(),
                      "fulfillment": o.fulfillment, "is_urgent": o.is_urgent, "created_at": o.created_at}
                     for o in _f(Order.objects.exclude(status="draft").select_related("customer", "agency"), ids)[:8]]

    alerts = [{"id": n.id, "level": n.level, "title": n.title, "body": n.body, "link": n.link, "created_at": n.created_at}
              for n in Notification.objects.filter(user=request.user, read_at__isnull=True)[:6]]

    total = pos_amount + order_amount
    return Response({
        "period": {"since": since, "until": until, "label": request.query_params.get("period", "today")},
        "kpis": {
            "revenue": total,
            "revenue_pos": pos_amount,
            "revenue_orders": order_amount,
            "revenue_trend": ((total - prev_amount) / prev_amount * 100) if prev_amount else None,
            "sales_count": sales.count(),
            "average_ticket": (pos_amount / sales.count()) if sales.count() else 0,
            "orders_new": orders_new.count(),
            "orders_open": orders_open.count(),
            "orders_urgent": orders_open.filter(is_urgent=True).count(),
            "deliveries_done": delivered.count(),
            "deliveries_in_progress": in_progress.count(),
            "deliveries_late": in_progress.filter(assigned_at__lt=late_limit).count(),
            "stock_low": len(low) - out,
            "stock_out": out,
            "expenses": expenses_amount,
            "expenses_pending": expenses.filter(status="pending").count(),
            "dues_upcoming": float(sum(finance.to_cdf(d.amount, d.currency) for d in dues)),
            "dues_overdue": dues.filter(status="overdue").count(),
            "agencies_active": agencies.filter(status="active").count(),
            "agencies_total": agencies.exclude(status="closed").count(),
            "cash_open": sessions.count(),
        },
        "series": series,
        "by_agency": by_agency,
        "top_products": top_products,
        "payment_methods": methods,
        "low_stock": low[:8],
        "recent_orders": recent_orders,
        "open_sessions": [{"id": s.id, "pos": s.pos.name, "agency": s.agency.name, "cashier": str(s.cashier),
                           "opened_at": s.opened_at} for s in sessions[:8]],
        "alerts": alerts,
    })


# ---------------------------------------------------------------------------- rapports
def _csv(filename, headers, rows):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
    response.write("﻿")
    writer = csv.writer(response, delimiter=";")
    writer.writerow(headers)
    for r in rows:
        writer.writerow(r)
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report(request, kind):
    ids = scope(request, "reports.view")
    since, until = period({"period": "month", **request.query_params.dict()})
    fmt = request.query_params.get("format_type", "json")
    group = request.query_params.get("group", "day")
    title = {"sales": "Rapport des ventes", "stock": "Rapport de stock", "finance": "Rapport financier",
             "orders": "Rapport des commandes", "deliveries": "Rapport des livraisons"}.get(kind)
    if title is None:
        raise ValidationError({"kind": "Rapport inconnu."})

    if kind == "sales":
        lines = SaleLine.objects.filter(sale__status__in=DONE_SALE, sale__occurred_at__date__gte=since, sale__occurred_at__date__lte=until)
        if ids is not None:
            lines = lines.filter(sale__agency__in=ids)
        for key, field in (("product", "product"), ("user", "sale__cashier"), ("category", "product__category")):
            if request.query_params.get(key):
                lines = lines.filter(**{field: request.query_params[key]})
        if request.query_params.get("method"):
            lines = lines.filter(sale__payments__method=request.query_params["method"]).distinct()
        groups = {
            "day": ("sale__occurred_at__date", "Jour"), "agency": ("sale__agency__name", "Agence"),
            "product": ("product__name", "Produit"), "user": ("sale__cashier__username", "Caissier"),
            "category": ("product__category__name", "Catégorie"),
        }
        if group == "method":
            rows = [{"key": r["method__name"], "count": r["n"], "total": float(r["t"])}
                    for r in FinancialTransaction.objects.filter(source="sale", direction="in", occurred_at__date__gte=since, occurred_at__date__lte=until,
                                                                 **({} if ids is None else {"agency__in": ids}))
                    .values("method__name").annotate(n=Count("id"), t=Sum("amount")).order_by("-t")]
            label = "Mode de paiement"
        else:
            field, label = groups.get(group, groups["day"])
            rows = [{"key": str(r[field]), "count": r["n"], "quantity": float(r["q"]), "total": float(r["t"])}
                    for r in lines.values(field).annotate(n=Count("sale", distinct=True), q=Sum("base_quantity"), t=Sum("total")).order_by(field if group == "day" else "-t")]
        totals = {"count": lines.values("sale").distinct().count(), "total": float(lines.aggregate(t=Sum("total"))["t"] or 0)}
        headers = [label, "Ventes", "Quantité", "Montant (CDF)"]
        csv_rows = [[r["key"], r["count"], r.get("quantity", ""), r["total"]] for r in rows]

    elif kind == "stock":
        mv = StockMovement.objects.filter(occurred_at__date__gte=since, occurred_at__date__lte=until)
        if ids is not None:
            mv = mv.filter(agency__in=ids)
        if request.query_params.get("product"):
            mv = mv.filter(product=request.query_params["product"])
        rows = [{"key": r["product__name"], "agency": r["agency__name"], "kind": r["kind"], "quantity": float(r["q"]), "count": r["n"]}
                for r in mv.filter(bucket__in=["available", "lost", "damaged"]).values("product__name", "agency__name", "kind").annotate(q=Sum("quantity"), n=Count("id")).order_by("product__name")]
        losses = mv.filter(kind__in=["loss", "damage"], bucket="available")
        gaps = mv.filter(kind="inventory")
        totals = {"movements": mv.count(), "losses": float(-(losses.aggregate(q=Sum("quantity"))["q"] or 0)),
                  "inventory_gaps": float(gaps.aggregate(q=Sum("quantity"))["q"] or 0),
                  "transfers": mv.filter(kind="transfer_out", bucket="available").values("reference").distinct().count()}
        label = "Produit"
        headers = ["Produit", "Agence", "Type", "Quantité", "Mouvements"]
        csv_rows = [[r["key"], r["agency"], r["kind"], r["quantity"], r["count"]] for r in rows]

    elif kind == "finance":
        tx = FinancialTransaction.objects.filter(occurred_at__date__gte=since, occurred_at__date__lte=until)
        if ids is not None:
            tx = tx.filter(agency__in=ids)
        field = {"day": "occurred_at__date", "agency": "agency__name", "category": "category__name", "method": "method__name"}.get(group, "occurred_at__date")
        data = {}
        for r in tx.values(field, "direction").annotate(t=Sum("amount_cdf")):
            row = data.setdefault(str(r[field]), {"key": str(r[field]), "in": 0, "out": 0})
            row[r["direction"]] = float(r["t"])
        rows = sorted(data.values(), key=lambda r: r["key"])
        for r in rows:
            r["balance"] = r["in"] - r["out"]
        sessions = CashSession.objects.filter(closed_at__date__gte=since, closed_at__date__lte=until)
        if ids is not None:
            sessions = sessions.filter(agency__in=ids)
        totals = {"in": sum(r["in"] for r in rows), "out": sum(r["out"] for r in rows),
                  "cash_gaps": float(sessions.aggregate(t=Sum("difference"))["t"] or 0),
                  "sessions_with_gap": sessions.exclude(difference=0).count()}
        totals["balance"] = totals["in"] - totals["out"]
        label = {"day": "Jour", "agency": "Agence", "category": "Catégorie", "method": "Moyen"}.get(group, "Jour")
        headers = [label, "Entrées (CDF)", "Sorties (CDF)", "Solde (CDF)"]
        csv_rows = [[r["key"], r["in"], r["out"], r["balance"]] for r in rows]

    elif kind == "orders":
        qs = Order.objects.filter(created_at__date__gte=since, created_at__date__lte=until).exclude(status="draft")
        if ids is not None:
            qs = qs.filter(agency__in=ids)
        rows = [{"key": Order.Status(r["status"]).label, "status": r["status"], "count": r["n"], "total": float(r["t"] or 0)}
                for r in qs.values("status").annotate(n=Count("id"), t=Sum("total")).order_by("-n")]
        waiting = qs.filter(status__in=["confirmed", "accepted"]).count()
        totals = {"count": qs.count(), "total": float(qs.aggregate(t=Sum("total"))["t"] or 0),
                  "delivered": qs.filter(status="completed").count(), "cancelled": qs.filter(status__in=["cancelled", "refused"]).count(),
                  "waiting": waiting}
        label = "Statut"
        headers = ["Statut", "Commandes", "Montant (CDF)"]
        csv_rows = [[r["key"], r["count"], r["total"]] for r in rows]

    else:  # deliveries
        qs = Delivery.objects.filter(created_at__date__gte=since, created_at__date__lte=until)
        if ids is not None:
            qs = qs.filter(agency__in=ids)
        duration = ExpressionWrapper(F("arrived_at") - F("assigned_at"), output_field=DurationField())
        avg = qs.filter(status="delivered", arrived_at__isnull=False).annotate(d=duration).aggregate(a=Avg("d"))["a"]
        late_limit = timezone.now() - timedelta(minutes=90)
        rows = [{"key": r["driver__user__first_name"] or "Non affecté", "count": r["n"],
                 "delivered": r["ok"], "failed": r["ko"]}
                for r in qs.values("driver__user__first_name").annotate(
                    n=Count("id"), ok=Count("id", filter=Q(status="delivered")), ko=Count("id", filter=Q(status="failed"))).order_by("-n")]
        totals = {"count": qs.count(), "delivered": qs.filter(status="delivered").count(),
                  "in_progress": qs.filter(status__in=["assigned", "accepted", "picked_up", "en_route"]).count(),
                  "cancelled": qs.filter(status__in=["cancelled", "failed"]).count(),
                  "late": qs.filter(status__in=["assigned", "accepted", "picked_up", "en_route"], assigned_at__lt=late_limit).count(),
                  "average_minutes": round(avg.total_seconds() / 60) if avg else None}
        label = "Livreur"
        headers = ["Livreur", "Livraisons", "Livrées", "Échouées"]
        csv_rows = [[r["key"], r["count"], r["delivered"], r["failed"]] for r in rows]

    if fmt == "csv":
        return _csv(f"gocelsys-{kind}-{since}-{until}", headers, csv_rows)
    return Response({"title": title, "since": since, "until": until, "group": group, "label": label, "rows": rows, "totals": totals})
