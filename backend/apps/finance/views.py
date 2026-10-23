import calendar
from datetime import timedelta
from decimal import Decimal

import django_filters
from django.db.models import Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core import audit
from apps.core.api import AgencyScopedViewSet, HasPerm, require

from . import services
from .models import Due, Expense, FinanceCategory, FinancialTransaction, PaymentMethod, RecurringCharge
from .serializers import (DueSerializer, ExpenseSerializer, FinanceCategorySerializer, PaymentMethodSerializer,
                          RecurringChargeSerializer, TransactionSerializer)


class PaymentMethodViewSet(viewsets.ModelViewSet):
    queryset = PaymentMethod.objects.all()
    serializer_class = PaymentMethodSerializer
    permission_classes = [HasPerm]
    perms = {"read": None, "*": "settings.manage"}
    pagination_class = None


class FinanceCategoryViewSet(viewsets.ModelViewSet):
    queryset = FinanceCategory.objects.all()
    serializer_class = FinanceCategorySerializer
    permission_classes = [HasPerm]
    perms = {"read": None, "*": "finance.manage"}
    pagination_class = None


class TransactionFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__gte")
    until = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__lte")

    class Meta:
        model = FinancialTransaction
        fields = ["agency", "direction", "source", "category", "method", "currency", "cash_session", "since", "until"]


class TransactionViewSet(AgencyScopedViewSet):
    queryset = FinancialTransaction.objects.select_related("agency", "method", "category", "user")
    serializer_class = TransactionSerializer
    perms = {"read": "finance.view", "create": "finance.manage"}
    filterset_class = TransactionFilter
    search_fields = ["reference", "label", "external_reference"]
    ordering_fields = ["occurred_at", "amount_cdf"]
    http_method_names = ["get", "post"]

    def perform_create(self, serializer):
        self.check_agency(serializer.validated_data["agency"], "finance.manage")
        d = serializer.validated_data
        tx = services.record(direction=d["direction"], source="manual", amount=d["amount"], agency=d["agency"],
                             currency=d.get("currency", "CDF"), method=d.get("method"), user=self.request.user,
                             label=d.get("label", ""), category_code=d["category"].code if d.get("category") else None,
                             occurred_at=d.get("occurred_at"))
        serializer.instance = tx
        audit.log(self.request.user, "finance.manual", "finance", tx, after={"montant": float(tx.amount), "sens": tx.direction})


class ExpenseFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name="spent_on", lookup_expr="gte")
    until = django_filters.DateFilter(field_name="spent_on", lookup_expr="lte")

    class Meta:
        model = Expense
        fields = ["agency", "category", "status", "currency", "since", "until"]


class ExpenseViewSet(AgencyScopedViewSet):
    queryset = Expense.objects.select_related("agency", "category", "method", "created_by", "approved_by")
    serializer_class = ExpenseSerializer
    perms = {"read": ["finance.view", "expenses.create"], "create": "expenses.create", "approve": "expenses.approve",
             "reject": "expenses.approve", "pay": ["finance.manage", "expenses.create"]}
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_class = ExpenseFilter
    search_fields = ["reference", "reason", "beneficiary"]
    ordering_fields = ["spent_on", "amount", "created_at"]
    http_method_names = ["get", "post"]

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        self.check_agency(s.validated_data["agency"], "expenses.create")
        expense = services.create_expense(user=request.user, data=s.validated_data)
        if request.data.get("pay_now") in (True, "true", "1") and expense.status == Expense.Status.APPROVED:
            from apps.sales.models import CashSession

            session = CashSession.objects.filter(pk=request.data.get("cash_session"), status="open").first()
            services.pay_expense(expense, request.user, cash_session=session)
        return Response(ExpenseSerializer(Expense.objects.get(pk=expense.pk), context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        e = self.get_object()
        self.check_agency(e.agency, "expenses.approve")
        return Response(ExpenseSerializer(services.approve_expense(e, request.user), context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        e = self.get_object()
        self.check_agency(e.agency, "expenses.approve")
        return Response(ExpenseSerializer(services.approve_expense(e, request.user, False, request.data.get("reason", "")),
                                          context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        from apps.sales.models import CashSession

        e = self.get_object()
        method = PaymentMethod.objects.filter(pk=request.data.get("method")).first()
        session = CashSession.objects.filter(pk=request.data.get("cash_session"), status="open").first()
        return Response(ExpenseSerializer(services.pay_expense(e, request.user, method, session), context={"request": request}).data)


class RecurringChargeViewSet(AgencyScopedViewSet):
    queryset = RecurringCharge.objects.select_related("agency", "category").prefetch_related("dues")
    serializer_class = RecurringChargeSerializer
    perms = {"read": ["finance.view", "charges.manage"], "*": "charges.manage"}
    filterset_fields = ["agency", "category", "status", "frequency"]
    search_fields = ["name", "beneficiary"]
    pagination_class = None

    def perform_create(self, serializer):
        self.check_agency(serializer.validated_data["agency"], "charges.manage")
        charge = serializer.save(created_by=self.request.user)
        services.generate_dues(charge=charge)
        audit.log(self.request.user, "charge.create", "due", charge)

    def perform_update(self, serializer):
        charge = serializer.save()
        charge.dues.filter(status__in=["upcoming", "due_soon"], due_date__gt=timezone.localdate()).delete()
        services.generate_dues(charge=charge)
        audit.log(self.request.user, "charge.update", "due", charge)


class DueFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    until = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")
    period = django_filters.CharFilter(method="filter_period")
    category = django_filters.NumberFilter(field_name="charge__category")
    status_in = django_filters.BaseInFilter(field_name="status")

    class Meta:
        model = Due
        fields = ["status", "since", "until", "period", "category", "status_in"]

    def filter_period(self, qs, name, value):
        today = timezone.localdate()
        if value == "today":
            return qs.filter(due_date=today)
        if value == "week":
            return qs.filter(due_date__gte=today - timedelta(days=today.weekday()), due_date__lte=today + timedelta(days=6 - today.weekday()))
        if value == "month":
            return qs.filter(due_date__year=today.year, due_date__month=today.month)
        if value == "next_month":
            nxt = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
            return qs.filter(due_date__year=nxt.year, due_date__month=nxt.month)
        return qs


class DueViewSet(AgencyScopedViewSet):
    queryset = Due.objects.select_related("charge__agency", "charge__category")
    serializer_class = DueSerializer
    agency_field = "charge__agency"
    perms = {"read": ["finance.view", "charges.manage"], "pay": "charges.manage", "calendar": ["finance.view", "charges.manage"]}
    filterset_class = DueFilter
    ordering = ["due_date"]
    http_method_names = ["get", "post"]

    def list(self, request, *args, **kwargs):
        services.refresh_due_statuses()
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        from apps.sales.models import CashSession

        due = self.get_object()
        self.check_agency(due.charge.agency, "charges.manage")
        method = PaymentMethod.objects.filter(pk=request.data.get("method")).first()
        session = CashSession.objects.filter(pk=request.data.get("cash_session"), status="open").first()
        amount = request.data.get("amount")
        return Response(DueSerializer(services.pay_due(due, request.user, method, Decimal(str(amount)) if amount else None, session)).data)

    @action(detail=False)
    def calendar(self, request):
        """Calendrier mensuel : ?month=2026-10"""
        services.refresh_due_statuses()
        month = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        year, mon = (int(x) for x in month.split("-"))
        first, last = 1, calendar.monthrange(year, mon)[1]
        qs = self.filter_queryset(self.get_queryset()).filter(due_date__year=year, due_date__month=mon)
        days = {}
        for due in qs:
            days.setdefault(due.due_date.day, []).append(DueSerializer(due).data)
        totals = {"to_pay": 0, "paid": 0, "overdue": 0}
        for due in qs:
            value = float(services.to_cdf(due.amount, due.currency))
            if due.status == "paid":
                totals["paid"] += value
            elif due.status == "overdue":
                totals["overdue"] += value
                totals["to_pay"] += value
            else:
                totals["to_pay"] += value
        return Response({"month": month, "first_weekday": calendar.monthrange(year, mon)[0], "days_in_month": last,
                         "first": first, "days": days, "totals": totals})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def treasury(request):
    """§25 — synthèse de trésorerie consolidée en CDF. ?agency= &since= &until="""
    require(request.user, "finance.view")
    today = timezone.localdate()
    since = request.query_params.get("since") or today.replace(day=1).isoformat()
    until = request.query_params.get("until") or today.isoformat()
    qs = FinancialTransaction.objects.filter(occurred_at__date__gte=since, occurred_at__date__lte=until)
    ids = request.user.agency_ids("finance.view")
    if ids is not None:
        qs = qs.filter(agency__in=ids)
    if request.query_params.get("agency"):
        qs = qs.filter(agency=request.query_params["agency"])

    def total(q):
        return float(q.aggregate(s=Sum("amount_cdf"))["s"] or 0)

    ins, outs = qs.filter(direction="in"), qs.filter(direction="out")
    from apps.sales.models import Sale

    sales = Sale.objects.filter(occurred_at__date__gte=since, occurred_at__date__lte=until, status__in=["completed", "partial_refund"])
    if ids is not None:
        sales = sales.filter(agency__in=ids)
    if request.query_params.get("agency"):
        sales = sales.filter(agency=request.query_params["agency"])
    from apps.orders.models import Order

    orders = Order.objects.filter(delivered_at__date__gte=since, delivered_at__date__lte=until, status="completed")
    if ids is not None:
        orders = orders.filter(agency__in=ids)
    if request.query_params.get("agency"):
        orders = orders.filter(agency=request.query_params["agency"])
    revenue = float(sales.aggregate(s=Sum("total"))["s"] or 0) + float(orders.aggregate(s=Sum("total"))["s"] or 0)
    daily = {}
    for row in qs.annotate(day=TruncDate("occurred_at")).values("day", "direction").annotate(t=Sum("amount_cdf")).order_by("day"):
        d = daily.setdefault(row["day"].isoformat(), {"day": row["day"].isoformat(), "in": 0, "out": 0})
        d[row["direction"]] = float(row["t"])
    by_category = [{"category": r["category__name"] or r["source"], "direction": r["direction"], "total": float(r["t"])}
                   for r in qs.values("category__name", "source", "direction").annotate(t=Sum("amount_cdf")).order_by("-t")]
    by_method = [{"method": r["method__name"] or "—", "total": float(r["t"])}
                 for r in ins.values("method__name").annotate(t=Sum("amount_cdf")).order_by("-t")]
    upcoming = Due.objects.exclude(status__in=["paid", "cancelled"]).filter(due_date__lte=today + timedelta(days=30))
    if ids is not None:
        upcoming = upcoming.filter(charge__agency__in=ids)
    return Response({
        "since": since, "until": until,
        "revenue": revenue,
        "inflows": {
            "sales": total(ins.filter(source="sale")),
            "orders": total(ins.filter(source="order")),
            "other": total(ins.exclude(source__in=["sale", "order"])),
            "total": total(ins),
        },
        "outflows": {
            "expenses": total(outs.filter(source="expense")),
            "charges": total(outs.filter(source="due")),
            "refunds": total(outs.filter(source="sale_refund")),
            "other": total(outs.exclude(source__in=["expense", "due", "sale_refund"])),
            "total": total(outs),
        },
        "balance": total(ins) - total(outs),
        "daily": list(daily.values()),
        "by_category": by_category,
        "by_method": by_method,
        "upcoming_dues": float(sum(services.to_cdf(d.amount, d.currency) for d in upcoming)),
        "note": "Le chiffre d'affaires n'est pas un bénéfice : il ne tient compte ni des dépenses ni des charges.",
    })
