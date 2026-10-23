from decimal import Decimal

import django_filters
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.agencies.models import Agency
from apps.catalog.models import Product
from apps.core.api import AgencyScopedViewSet, BusinessError, require

from . import services
from .models import Bucket, InventoryCount, StockBalance, StockMovement, Transfer
from .serializers import InventoryLineSerializer, InventorySerializer, StockMovementSerializer, TransferSerializer


def _agency(user, agency_id, code):
    try:
        agency = Agency.objects.get(pk=agency_id)
    except (Agency.DoesNotExist, ValueError, TypeError):
        raise ValidationError({"agency": "Agence inconnue."})
    require(user, code, agency)
    return agency


def _product(pid):
    try:
        return Product.objects.get(pk=pid)
    except (Product.DoesNotExist, ValueError, TypeError):
        raise ValidationError({"product": "Produit inconnu."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stock_levels(request):
    """
    Vue matricielle du stock : une ligne par (agence, produit) avec tous les compartiments.
    ?agency= &category= &search= &state=low|out|ok
    """
    require(request.user, "stock.view")
    ids = request.user.agency_ids("stock.view")
    agencies = Agency.objects.exclude(status="closed")
    if ids is not None:
        agencies = agencies.filter(pk__in=ids)
    if request.query_params.get("agency"):
        agencies = agencies.filter(pk=request.query_params["agency"])
    products = Product.objects.filter(status="active").select_related("category", "base_unit")
    if request.query_params.get("category"):
        products = products.filter(Q(category=request.query_params["category"]) | Q(category__parent=request.query_params["category"]))
    if request.query_params.get("search"):
        s = request.query_params["search"]
        products = products.filter(Q(name__icontains=s) | Q(code__icontains=s))
    balances = {}
    for b in StockBalance.objects.filter(agency__in=agencies, product__in=products):
        balances.setdefault((b.agency_id, b.product_id), {})[b.bucket] = float(b.quantity)
    state = request.query_params.get("state")
    rows = []
    for a in agencies:
        for p in products:
            q = balances.get((a.pk, p.pk), {})
            available = q.get("available", 0)
            level = "out" if available <= 0 else "low" if p.min_stock and available <= float(p.min_stock) else "ok"
            if state and level != state:
                continue
            rows.append({
                "agency": a.pk, "agency_name": a.name, "agency_code": a.code,
                "product": p.pk, "product_name": p.name, "product_code": p.code,
                "category": p.category.name, "unit": p.base_unit.name,
                "min_stock": float(p.min_stock), "max_stock": float(p.max_stock),
                "available": available, "reserved": q.get("reserved", 0), "in_transit": q.get("in_transit", 0),
                "damaged": q.get("damaged", 0), "lost": q.get("lost", 0), "returned": q.get("returned", 0),
                "level": level, "value": available * float(p.price),
            })
    summary = {
        "rows": len(rows),
        "out": sum(1 for r in rows if r["level"] == "out"),
        "low": sum(1 for r in rows if r["level"] == "low"),
        "value": sum(r["value"] for r in rows),
        "in_transit": sum(r["in_transit"] for r in rows),
        "reserved": sum(r["reserved"] for r in rows),
    }
    return Response({"summary": summary, "results": rows})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def stock_operation(request):
    """
    Opérations manuelles : {"type": "adjust"|"loss"|"damage"|"production", "agency", "product", "quantity", "reason"}
    """
    data = request.data
    kind = data.get("type")
    product = _product(data.get("product"))
    qty = Decimal(str(data.get("quantity", "0")))
    reason = (data.get("reason") or "").strip()
    attachment = request.FILES.get("attachment")
    if kind == "adjust":
        agency = _agency(request.user, data.get("agency"), "stock.adjust")
        current = services.quantity(agency, product)
        big = abs(qty - current) > max(Decimal(20), current * Decimal("0.1"))
        if big and not request.user.has_code("stock.adjust_large", agency.pk):
            raise BusinessError("Correction importante : elle doit être validée par la direction ou un responsable habilité.",
                                code="needs_approval")
        services.adjust(agency=agency, product=product, new_quantity=qty, user=request.user, reason=reason, attachment=attachment)
    elif kind in ("loss", "damage"):
        agency = _agency(request.user, data.get("agency"), "stock.loss")
        if qty <= 0 or not reason:
            raise BusinessError("Quantité positive et motif obligatoires.")
        services.declare_loss(agency=agency, product=product, quantity=qty, user=request.user, reason=reason,
                              damaged=kind == "damage", attachment=attachment)
    elif kind == "production":
        agency = _agency(request.user, data.get("agency"), "stock.adjust")
        if qty <= 0:
            raise BusinessError("Quantité positive obligatoire.")
        services.receive_production(agency=agency, product=product, quantity=qty, user=request.user, reason=reason or "Production")
    else:
        raise ValidationError({"type": "Type d'opération inconnu."})
    return Response({"available": services.quantity(agency, product)})


class MovementFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__gte")
    until = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__lte")

    class Meta:
        model = StockMovement
        fields = ["agency", "product", "kind", "bucket", "reference", "since", "until"]


class StockMovementViewSet(AgencyScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related("product", "agency", "user")
    serializer_class = StockMovementSerializer
    perms = {"*": "stock.view"}
    filterset_class = MovementFilter
    search_fields = ["reference", "product__name", "reason"]
    http_method_names = ["get"]


class TransferViewSet(AgencyScopedViewSet):
    queryset = Transfer.objects.select_related("source", "destination", "requested_by").prefetch_related("lines__product__base_unit")
    serializer_class = TransferSerializer
    perms = {"read": ["stock.view", "transfers.request"], "create": "transfers.request", "validate": "transfers.validate",
             "reject": "transfers.validate", "ship": "transfers.ship", "receive": "transfers.receive",
             "cancel": "transfers.request"}
    filterset_fields = ["status", "source", "destination"]
    search_fields = ["reference"]
    http_method_names = ["get", "post"]

    def get_queryset(self):
        qs = super(AgencyScopedViewSet, self).get_queryset()
        ids = set()
        for code in ("stock.view", "transfers.request", "transfers.receive"):
            part = self.request.user.agency_ids(code)
            if part is None:
                ids = None
                break
            ids |= part
        if ids is not None:
            qs = qs.filter(Q(source__in=ids) | Q(destination__in=ids))
        a = self.request.query_params.get("agency")
        if a:
            qs = qs.filter(Q(source=a) | Q(destination=a))
        return qs

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        source, destination = s.validated_data["source"], s.validated_data["destination"]
        if not (request.user.has_code("transfers.request", source.pk) or request.user.has_code("transfers.request", destination.pk)):
            raise BusinessError("Vous devez être rattaché à l'agence source ou destination.")
        transfer = services.create_transfer(source=source, destination=destination, lines=s.validated_data["lines"],
                                            user=request.user, reason=s.validated_data.get("reason", ""))
        return Response(TransferSerializer(transfer).data, status=201)

    def _done(self, transfer):
        return Response(TransferSerializer(Transfer.objects.get(pk=transfer.pk)).data)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        t = self.get_object()
        self.check_agency(t.source, "transfers.validate")
        return self._done(services.validate_transfer(t, request.user, True, request.data.get("note", "")))

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        t = self.get_object()
        self.check_agency(t.source, "transfers.validate")
        return self._done(services.validate_transfer(t, request.user, False, request.data.get("note", "")))

    @action(detail=True, methods=["post"])
    def ship(self, request, pk=None):
        t = self.get_object()
        self.check_agency(t.source, "transfers.ship")
        shipped = {int(k): v for k, v in (request.data.get("quantities") or {}).items()}
        return self._done(services.ship_transfer(t, request.user, shipped))

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        t = self.get_object()
        self.check_agency(t.destination, "transfers.receive")
        received = {int(k): v for k, v in (request.data.get("received") or {}).items()}
        damaged = {int(k): v for k, v in (request.data.get("damaged") or {}).items()}
        return self._done(services.receive_transfer(t, request.user, received, damaged, request.data.get("note", "")))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        t = self.get_object()
        return self._done(services.cancel_transfer(t, request.user, request.data.get("note", "")))


class InventoryViewSet(AgencyScopedViewSet):
    queryset = InventoryCount.objects.select_related("agency", "created_by").prefetch_related("lines__product__base_unit")
    serializer_class = InventorySerializer
    perms = {"read": ["inventory.manage", "inventory.validate", "stock.view"], "create": "inventory.manage",
             "count": "inventory.manage", "submit": "inventory.manage", "validate": "inventory.validate",
             "cancel": "inventory.manage"}
    filterset_fields = ["status", "agency"]
    http_method_names = ["get", "post"]

    def create(self, request, *args, **kwargs):
        agency = _agency(request.user, request.data.get("agency"), "inventory.manage")
        products = None
        if request.data.get("category"):
            products = Product.objects.filter(status="active", category=request.data["category"])
        inv = services.start_inventory(agency=agency, user=request.user, products=products, note=request.data.get("scope_note", ""))
        return Response(InventorySerializer(inv).data, status=201)

    @action(detail=True, methods=["post"])
    def count(self, request, pk=None):
        """Saisie du comptage : {"lines": [{"id": 1, "counted": 490, "note": ""}]}"""
        inv = self.get_object()
        if inv.status != InventoryCount.Status.DRAFT:
            raise BusinessError("Cet inventaire n'est plus modifiable.")
        lines = {line.pk: line for line in inv.lines.all()}
        for row in request.data.get("lines", []):
            line = lines.get(int(row["id"]))
            if line is None:
                continue
            line.counted = None if row.get("counted") in (None, "") else Decimal(str(row["counted"]))
            line.note = row.get("note", line.note)
            line.save(update_fields=["counted", "note"])
        return Response(InventorySerializer(InventoryCount.objects.get(pk=inv.pk)).data)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return Response(InventorySerializer(services.submit_inventory(self.get_object(), request.user)).data)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        inv = self.get_object()
        self.check_agency(inv.agency, "inventory.validate")
        return Response(InventorySerializer(services.validate_inventory(inv, request.user)).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        inv = self.get_object()
        if inv.status == InventoryCount.Status.VALIDATED:
            raise BusinessError("Un inventaire validé ne peut pas être annulé.")
        inv.status = InventoryCount.Status.CANCELLED
        inv.save()
        return Response(InventorySerializer(inv).data)
