import django_filters
from django.db.models import Count, Q, Sum
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.agencies.models import Agency, DeliveryZone
from apps.catalog.models import Category, Product, Promotion, ShowcaseSlide
from apps.core.api import AgencyScopedViewSet, BusinessError, HasPerm, require
from apps.finance.models import PaymentMethod
from apps.inventory.models import StockBalance

from . import services
from .models import Address, Customer, Order
from .serializers import (AddressSerializer, CustomerSerializer, OrderListSerializer, OrderSerializer,
                          PlaceOrderSerializer)

OPEN_STATUSES = ["confirmed", "accepted", "preparing", "ready", "driver_assigned", "in_delivery", "failed"]


class OrderFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    until = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    open = django_filters.BooleanFilter(method="filter_open")
    status_in = django_filters.BaseInFilter(field_name="status")

    class Meta:
        model = Order
        fields = ["agency", "status", "fulfillment", "payment_status", "customer", "is_urgent", "since", "until", "open", "status_in"]

    def filter_open(self, qs, name, value):
        return qs.filter(status__in=OPEN_STATUSES) if value else qs.exclude(status__in=OPEN_STATUSES)


def _place(request, customer, data, user):
    agency = Agency.objects.filter(pk=data.get("agency")).first() if data.get("agency") else None
    address = None
    if data.get("address"):
        address = Address.objects.filter(pk=data["address"], customer=customer).first()
        if address is None:
            raise ValidationError({"address": "Adresse inconnue."})
    zone = DeliveryZone.objects.filter(pk=data.get("zone")).first() if data.get("zone") else None
    method = PaymentMethod.objects.filter(pk=data.get("payment_method"), is_active=True).first() if data.get("payment_method") else None
    order = services.place_order(
        customer=customer, lines=data["lines"], fulfillment=data["fulfillment"], user=user, requested_agency=agency,
        address=address, zone=zone, payment_method=method, promo_code=data.get("promo_code"), note=data.get("note", ""),
        client_uuid=data.get("client_uuid"), channel=data.get("channel", "app"), is_urgent=data.get("is_urgent", False),
    )
    if data.get("payment_reference"):
        order.payment_reference = data["payment_reference"]
        order.save(update_fields=["payment_reference"])
    return order


class OrderViewSet(AgencyScopedViewSet):
    """Back-office : suivi et traitement des commandes par les agences."""

    queryset = Order.objects.select_related("customer", "agency", "zone", "payment_method", "delivery__driver__user").prefetch_related("lines__product", "history__user")
    perms = {"read": "orders.view", "create": "orders.manage", "transition": "orders.manage", "paid": "orders.manage",
             "pickup": "orders.manage", "assign": "deliveries.manage", "stock_check": "orders.view", "board": "orders.view"}
    filterset_class = OrderFilter
    search_fields = ["reference", "customer__name", "customer__phone", "address_text"]
    ordering_fields = ["created_at", "total", "status"]
    http_method_names = ["get", "post"]

    def get_serializer_class(self):
        return OrderListSerializer if self.action == "list" else OrderSerializer

    def create(self, request, *args, **kwargs):
        """Commande saisie par le personnel (téléphone, WhatsApp)."""
        s = PlaceOrderSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        customer = Customer.objects.filter(pk=s.validated_data.get("customer")).first()
        if customer is None:
            raise ValidationError({"customer": "Client obligatoire."})
        data = dict(s.validated_data)
        data.setdefault("channel", "telephone")
        order = _place(request, customer, data, request.user)
        return Response(OrderSerializer(order, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        order = self.get_object()
        target = request.data.get("status")
        if target in ("cancelled", "refused"):
            self.check_agency(order.agency, "orders.cancel")
        else:
            self.check_agency(order.agency, "orders.manage")
        order = services.transition(order, target, user=request.user, note=request.data.get("note", ""))
        return Response(OrderSerializer(Order.objects.get(pk=order.pk), context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def paid(self, request, pk=None):
        order = self.get_object()
        method = PaymentMethod.objects.filter(pk=request.data.get("method")).first()
        services.mark_paid(order, request.user, method, request.data.get("reference", ""))
        return Response(OrderSerializer(Order.objects.get(pk=order.pk), context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def pickup(self, request, pk=None):
        order = services.complete_pickup(self.get_object(), request.user, request.data.get("code"))
        return Response(OrderSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        from apps.delivery import services as delivery
        from apps.delivery.models import Driver

        order = self.get_object()
        self.check_agency(order.agency, "deliveries.manage")
        driver = Driver.objects.filter(pk=request.data.get("driver")).first()
        if driver is None:
            raise ValidationError({"driver": "Livreur inconnu."})
        delivery.assign(order, driver, request.user)
        return Response(OrderSerializer(Order.objects.get(pk=order.pk), context={"request": request}).data)

    @action(detail=True)
    def stock_check(self, request, pk=None):
        return Response(services.stock_check(self.get_object()))

    @action(detail=False)
    def board(self, request):
        """Colonnes du tableau de préparation (Kanban)."""
        qs = self.filter_queryset(self.get_queryset()).filter(status__in=OPEN_STATUSES)
        columns = {s: [] for s in ["confirmed", "accepted", "preparing", "ready", "driver_assigned", "in_delivery", "failed"]}
        for order in qs[:300]:
            columns[order.status].append(OrderListSerializer(order, context={"request": request}).data)
        return Response(columns)


class CustomerViewSet(AgencyScopedViewSet):
    agency_field = None
    serializer_class = CustomerSerializer
    perms = {"read": ["customers.view", "orders.manage", "sales.create"], "*": "customers.manage",
             "create": ["customers.manage", "orders.manage", "sales.create"], "address": ["customers.manage", "orders.manage"]}
    search_fields = ["name", "phone", "email"]
    filterset_fields = ["status", "preferred_agency"]
    ordering_fields = ["name", "created_at", "loyalty_points"]
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        return Customer.objects.select_related("preferred_agency").prefetch_related("addresses").annotate(
            orders_count=Count("orders", distinct=True),
            total_spent=Sum("orders__total", filter=Q(orders__status="completed")),
        )

    @action(detail=True, methods=["post"])
    def address(self, request, pk=None):
        customer = self.get_object()
        s = AddressSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(customer=customer)
        return Response(s.data, status=201)


# ============================================================================ boutique client
def _customer(request):
    customer = getattr(request.user, "customer", None)
    if customer is None:
        raise PermissionDenied("Espace réservé aux clients.")
    if customer.status == Customer.Status.BLOCKED:
        raise PermissionDenied("Votre compte client est suspendu. Contactez une agence.")
    return customer


@api_view(["GET"])
@permission_classes([AllowAny])
def shop_bootstrap(request):
    """Tout ce dont l'app client a besoin au démarrage."""
    agencies = Agency.objects.filter(status="active", accepts_online_orders=True)
    return Response({
        "agencies": [{"id": a.id, "code": a.code, "name": a.name, "city": a.city, "address": a.address, "phone": a.phone,
                      "latitude": a.latitude, "longitude": a.longitude, "opening_hours": a.opening_hours} for a in agencies],
        "categories": [{"id": c.id, "name": c.name, "icon": c.icon, "parent": c.parent_id, "color": c.color,
                        "description": c.description} for c in Category.objects.filter(is_active=True)],
        "zones": [{"id": z.id, "agency": z.agency_id, "name": z.name, "fee": z.fee, "min_order": z.min_order,
                   "estimated_minutes": z.estimated_minutes} for z in DeliveryZone.objects.filter(is_active=True, agency__in=agencies)],
        "payment_methods": [{"id": m.id, "code": m.code, "name": m.name, "kind": m.kind, "requires_reference": m.requires_reference}
                            for m in PaymentMethod.objects.filter(is_active=True, available_online=True)],
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def shop_catalog(request):
    """Catalogue public avec disponibilité pour l'agence choisie (?agency=). Accessible sans compte."""
    agency = request.query_params.get("agency")
    qs = Product.objects.filter(status="active", sold_online=True).select_related("category", "base_unit").prefetch_related("units__unit")
    if request.query_params.get("category"):
        c = request.query_params["category"]
        qs = qs.filter(Q(category=c) | Q(category__parent=c))
    if request.query_params.get("search"):
        qs = qs.filter(name__icontains=request.query_params["search"])
    if request.query_params.get("featured") == "1":
        qs = qs.filter(is_featured=True)
    stock = {}
    if agency:
        for b in StockBalance.objects.filter(agency_id=agency, bucket="available"):
            stock[b.product_id] = float(b.quantity)
    items = []
    for p in qs:
        available = stock.get(p.id, 0)
        items.append({
            "id": p.id, "name": p.name, "description": p.description, "category": p.category_id,
            "category_name": p.category.name, "image": request.build_absolute_uri(p.image.url) if p.image else None,
            "image_cutout": p.image_cutout, "accent": p.accent, "visual": p.visual, "is_featured": p.is_featured, "code": p.code,
            "category_parent": p.category.parent_id,
            "base_unit": p.base_unit.name, "price": p.price, "current_price": p.current_price(),
            "in_stock": available > 0, "available": available if agency else None,
            "units": [{"id": u.id, "unit": u.unit.name, "factor": u.factor, "price": u.price, "current_price": u.current_price(),
                       "in_stock": available >= float(u.factor)} for u in p.units.all()],
        })
    return Response(items)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_home(request):
    """Données de la vitrine publique : chiffres clés, univers, produits vedettes, agences."""
    from apps.sales.models import Sale

    agencies = Agency.objects.filter(status="active").exclude(is_production_site=True)
    products = Product.objects.filter(status="active", sold_online=True)
    cats = []
    for c in Category.objects.filter(is_active=True, parent=None):
        n = products.filter(Q(category=c) | Q(category__parent=c)).count()
        if n:
            cats.append({"id": c.id, "name": c.name, "description": c.description, "color": c.color, "icon": c.icon, "count": n})
    featured = list(products.filter(is_featured=True).select_related("category", "base_unit")[:10])
    return Response({
        "figures": {
            "products": products.count(),
            "agencies": agencies.count(),
            "customers": Customer.objects.count(),
            "deliveries": Order.objects.filter(status="completed", fulfillment="delivery").count(),
            "sales": Sale.objects.filter(status="completed").count(),
        },
        "categories": cats,
        "showcase": [{"id": s.id, "word": s.word, "title": s.title, "text": s.text, "color": s.color, "model": s.model,
                      "label_title": s.label_title, "label_sub": s.label_sub,
                      "image": request.build_absolute_uri(s.image.url) if s.image else None,
                      "category": s.category_id, "category_name": s.category.name if s.category else None}
                     for s in ShowcaseSlide.objects.filter(is_active=True).select_related("category")],
        "featured": [{"id": p.id, "name": p.name, "category_name": p.category.name, "accent": p.accent, "visual": p.visual,
                      "image": request.build_absolute_uri(p.image.url) if p.image else None, "image_cutout": p.image_cutout,
                      "description": p.description, "price": p.price, "current_price": p.current_price(),
                      "base_unit": p.base_unit.name} for p in featured],
        "agencies": [{"id": a.id, "name": a.name, "city": a.city, "address": a.address, "phone": a.phone,
                      "latitude": a.latitude, "longitude": a.longitude, "opening_hours": a.opening_hours,
                      "zones": [z.name for z in a.zones.filter(is_active=True)]} for a in agencies],
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def shop_promo(request):
    promo = Promotion.objects.filter(code__iexact=(request.data.get("code") or "").strip()).first()
    amount = request.data.get("amount") or 0
    if promo is None:
        return Response({"valid": False, "detail": "Code inconnu."})
    from decimal import Decimal

    discount = promo.discount_for(Decimal(str(amount)))
    return Response({"valid": discount > 0, "discount": discount, "label": promo.label,
                     "detail": "" if discount > 0 else "Code non applicable à ce panier."})


class ShopOrderViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        customer = _customer(self.request)
        return Order.objects.filter(customer=customer).select_related("agency", "zone", "payment_method", "delivery__driver__user").prefetch_related("lines__product", "history")

    def create(self, request, *args, **kwargs):
        customer = _customer(request)
        s = PlaceOrderSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = dict(s.validated_data)
        data["channel"] = "app"
        order = _place(request, customer, data, request.user)
        return Response(OrderSerializer(order, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = services.transition(self.get_object(), "cancelled", user=request.user,
                                    note=request.data.get("reason", "Annulée par le client"), by_customer=True)
        return Response(OrderSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def rate(self, request, pk=None):
        order = self.get_object()
        if order.status != "completed":
            raise BusinessError("Vous pourrez noter la commande une fois terminée.")
        order.rating = max(1, min(5, int(request.data.get("rating", 5))))
        order.save(update_fields=["rating"])
        return Response(OrderSerializer(order, context={"request": request}).data)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        """Prépare un panier à partir d'une ancienne commande."""
        order = self.get_queryset().filter(pk=request.data.get("order")).first()
        if order is None:
            raise ValidationError({"order": "Commande inconnue."})
        return Response([{"product": line.product_id, "product_unit": line.product_unit_id, "quantity": line.quantity}
                         for line in order.lines.all()])


class ShopAddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Address.objects.filter(customer=_customer(self.request))

    def perform_create(self, serializer):
        customer = _customer(self.request)
        first = not customer.addresses.exists()
        address = serializer.save(customer=customer, is_default=first or serializer.validated_data.get("is_default", False))
        if address.is_default:
            customer.addresses.exclude(pk=address.pk).update(is_default=False)

    def perform_update(self, serializer):
        address = serializer.save()
        if address.is_default:
            address.customer.addresses.exclude(pk=address.pk).update(is_default=False)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def shop_profile(request):
    customer = _customer(request)
    if request.method == "PATCH":
        for f in ("name", "email"):
            if f in request.data:
                setattr(customer, f, request.data[f])
        if "preferred_agency" in request.data:
            customer.preferred_agency_id = request.data["preferred_agency"] or None
        customer.save()
    return Response(CustomerSerializer(Customer.objects.annotate(
        orders_count=Count("orders"), total_spent=Sum("orders__total", filter=Q(orders__status="completed"))).get(pk=customer.pk)).data)


__all__ = ["HasPerm", "require"]
