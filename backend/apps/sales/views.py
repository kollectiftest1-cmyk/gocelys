import django_filters
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.agencies.models import PointOfSale
from apps.core.api import AgencyScopedViewSet, BusinessError, require

from . import services
from .models import CashSession, Sale
from .serializers import CashSessionSerializer, SaleCreateSerializer, SaleSerializer


class SaleFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__gte")
    until = django_filters.DateFilter(field_name="occurred_at", lookup_expr="date__lte")

    class Meta:
        model = Sale
        fields = ["agency", "pos", "session", "cashier", "status", "created_offline", "since", "until"]


class SaleViewSet(AgencyScopedViewSet):
    queryset = Sale.objects.select_related("agency", "pos", "cashier", "customer").prefetch_related("lines", "payments__method")
    serializer_class = SaleSerializer
    perms = {"read": ["sales.view", "sales.create"], "create": "sales.create", "cancel": "sales.cancel", "refund": "sales.refund"}
    filterset_class = SaleFilter
    search_fields = ["reference", "offline_reference", "customer__name", "customer__phone"]
    ordering_fields = ["occurred_at", "total"]
    http_method_names = ["get", "post"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.has_code("sales.view"):
            qs = qs.filter(cashier=user)
        return qs

    def create(self, request, *args, **kwargs):
        s = SaleCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        session = CashSession.objects.select_related("agency", "pos").filter(pk=data["session"]).first()
        if session is None:
            raise ValidationError({"session": "Session inconnue."})
        require(request.user, "sales.create", session.agency)
        if session.cashier_id != request.user.pk:
            raise BusinessError("Cette caisse est ouverte par un autre utilisateur.")
        customer = None
        if data.get("customer"):
            from apps.orders.models import Customer

            customer = Customer.objects.filter(pk=data["customer"]).first()
        sale, created = services.create_sale(
            user=request.user, session=session, lines=data["lines"], payments=data["payments"],
            client_uuid=data.get("client_uuid"), discount=data.get("discount") or 0,
            discount_reason=data.get("discount_reason", ""), promo_code=data.get("promo_code"), customer=customer,
        )
        return Response(SaleSerializer(sale).data, status=201 if created else 200)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        sale = services.cancel_sale(self.get_object(), user=request.user, reason=request.data.get("reason", ""))
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        sale = services.cancel_sale(self.get_object(), user=request.user, reason=request.data.get("reason", ""), refund=True)
        return Response(SaleSerializer(sale).data)


class CashSessionViewSet(AgencyScopedViewSet):
    queryset = CashSession.objects.select_related("pos", "agency", "cashier", "validated_by")
    serializer_class = CashSessionSerializer
    perms = {"read": ["cash.view", "cash.operate"], "open": "cash.operate", "close": "cash.operate",
             "validate": "cash.validate", "figures": ["cash.view", "cash.operate"], "current": "cash.operate",
             "movement": "cash.operate"}
    filterset_fields = ["status", "agency", "pos", "cashier"]
    ordering_fields = ["opened_at", "difference"]
    http_method_names = ["get", "post"]

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.has_code("cash.view"):
            qs = qs.filter(cashier=self.request.user)
        return qs

    def _out(self, session):
        data = CashSessionSerializer(session).data
        data["figures"] = services.session_figures(session)
        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        return self._out(self.get_object())

    @action(detail=False)
    def current(self, request):
        session = CashSession.objects.filter(cashier=request.user, status="open").first()
        return self._out(session) if session else Response(None)

    @action(detail=False, methods=["post"])
    def open(self, request):
        """Ouvre la session sur la caisse affectée au caissier (le champ « pos » n'est utile qu'aux responsables)."""
        pos = None
        if request.data.get("pos"):
            pos = PointOfSale.objects.select_related("agency").filter(pk=request.data["pos"]).first()
            if pos is None:
                raise ValidationError({"pos": "Point de vente inconnu."})
        pos = services.resolve_pos(request.user, pos)
        require(request.user, "cash.operate", pos.agency)
        session = services.open_session(pos=pos, user=request.user, opening_float=request.data.get("opening_float"),
                                        client_uuid=request.data.get("client_uuid"))
        return self._out(session)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        session = services.close_session(self.get_object(), user=request.user, counted_cash=request.data.get("counted_cash", 0),
                                         count_detail=request.data.get("count_detail"),
                                         justification=request.data.get("justification", ""))
        return self._out(session)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        session = self.get_object()
        self.check_agency(session.agency, "cash.validate")
        return self._out(services.validate_session(session, request.user, request.data.get("note", "")))

    @action(detail=True)
    def figures(self, request, pk=None):
        return Response(services.session_figures(self.get_object()))

    @action(detail=True, methods=["post"])
    def movement(self, request, pk=None):
        session = self.get_object()
        if session.cashier_id != request.user.pk:
            raise BusinessError("Seul le caissier de la session peut faire un mouvement de caisse.")
        services.cash_movement(session, user=request.user, direction=request.data.get("direction", "out"),
                               amount=request.data.get("amount"), label=request.data.get("label", ""))
        return self._out(session)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_push(request):
    """
    Remontée des opérations du POS hors ligne.
    {"device_id": "...", "operations": [{"op_id": uuid, "type": "sale.create", "occurred_at": iso, "payload": {...}}]}
    Les opérations sont appliquées dans l'ordre ; chaque op_id n'est appliqué qu'une seule fois.
    """
    device = request.data.get("device_id", "")
    ops = request.data.get("operations") or []
    results = [services.apply_operation(op, user=request.user, device_id=device) for op in ops[:500]]
    if request.data.get("pos"):
        PointOfSale.objects.filter(pk=request.data["pos"]).update(last_sync_at=timezone.now(), device_id=device)
    return Response({"results": results, "server_time": timezone.now()})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_pull(request):
    """Données de référence pour le fonctionnement hors ligne d'un POS / de l'app entreprise."""
    from apps.catalog.models import Category, Product
    from apps.catalog.serializers import CategorySerializer, ProductSerializer
    from apps.core.models import Setting
    from apps.finance.models import PaymentMethod
    from apps.inventory.models import StockBalance

    agency_id = request.query_params.get("agency")
    products = Product.objects.filter(status="active").select_related("category", "base_unit").prefetch_related("units__unit")
    stock = {}
    if agency_id:
        if not request.user.has_code("sales.create", int(agency_id)):
            require(request.user, "stock.view", int(agency_id))
        for b in StockBalance.objects.filter(agency_id=agency_id, bucket="available"):
            stock[b.product_id] = float(b.quantity)
    mine = request.user.assigned_pos
    if not agency_id and mine:
        agency_id = mine.agency_id
        for b in StockBalance.objects.filter(agency_id=agency_id, bucket="available"):
            stock[b.product_id] = float(b.quantity)
    pos = PointOfSale.objects.filter(agency_id=agency_id, is_active=True) if agency_id else PointOfSale.objects.none()
    return Response({
        "server_time": timezone.now(),
        "settings": Setting.all_values(),
        "categories": CategorySerializer(Category.objects.filter(is_active=True), many=True).data,
        "products": ProductSerializer(products, many=True, context={"request": request}).data,
        "stock": stock,
        "payment_methods": [{"id": m.id, "code": m.code, "name": m.name, "kind": m.kind, "requires_reference": m.requires_reference}
                            for m in PaymentMethod.objects.filter(is_active=True, available_pos=True)],
        "agency": int(agency_id) if agency_id else None,
        "my_pos": {"id": mine.id, "name": mine.name, "agency": mine.agency_id, "agency_name": mine.agency.name,
                   "default_float": float(mine.default_float)} if mine else None,
        "can_choose_pos": bool(agency_id) and request.user.has_code("cash.validate", int(agency_id)),
        "points_of_sale": [{"id": p.id, "code": p.code, "name": p.name, "default_float": float(p.default_float)} for p in pos],
    })
