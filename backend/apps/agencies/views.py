from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import audit
from apps.core.api import AgencyScopedViewSet

from .models import Agency, DeliveryZone, PointOfSale
from .serializers import AgencyDetailSerializer, AgencySerializer, DeliveryZoneSerializer, PointOfSaleSerializer


class AgencyViewSet(AgencyScopedViewSet):
    agency_field = "pk"
    perms = {"read": "agencies.view", "stats": "agencies.view", "*": "agencies.manage"}
    search_fields = ["name", "code", "city"]
    filterset_fields = ["status", "accepts_online_orders"]
    ordering_fields = ["name", "code", "created_at"]

    def get_queryset(self):
        qs = Agency.objects.select_related("manager").annotate(
            pos_count=Count("points_of_sale", distinct=True),
            staff_count=Count("role_assignments__user", distinct=True),
            open_sessions=Count("cash_sessions", filter=Q(cash_sessions__status="open"), distinct=True),
        )
        self.queryset = qs
        return super().get_queryset()

    def get_serializer_class(self):
        return AgencyDetailSerializer if self.action == "retrieve" else AgencySerializer

    def perform_create(self, serializer):
        agency = serializer.save()
        audit.log(self.request.user, "agency.create", "agency", agency, agency=agency)

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        agency = serializer.save()
        audit.log(self.request.user, "agency.update", "agency", agency, agency=agency, before=before, after=audit.snapshot(agency))

    def destroy(self, request, *args, **kwargs):
        agency = self.get_object()
        agency.status = Agency.Status.CLOSED
        agency.save(update_fields=["status"])
        audit.log(request.user, "agency.close", "agency", agency, agency=agency)
        return Response(status=204)

    @action(detail=True)
    def stats(self, request, pk=None):
        from apps.inventory.models import StockBalance
        from apps.orders.models import Order
        from apps.sales.models import Sale

        agency = self.get_object()
        today = timezone.localdate()
        sales = Sale.objects.filter(agency=agency, status="completed")
        low = 0
        for b in StockBalance.objects.filter(agency=agency, bucket="available").select_related("product"):
            if b.product.min_stock and b.quantity <= b.product.min_stock:
                low += 1
        return Response({
            "sales_today": sales.filter(occurred_at__date=today).aggregate(s=Sum("total"))["s"] or 0,
            "sales_month": sales.filter(occurred_at__date__gte=today.replace(day=1)).aggregate(s=Sum("total"))["s"] or 0,
            "orders_open": Order.objects.filter(agency=agency).exclude(status__in=["completed", "cancelled", "refused", "refunded", "draft"]).count(),
            "low_stock": low,
        })


class PointOfSaleViewSet(AgencyScopedViewSet):
    queryset = PointOfSale.objects.select_related("agency").prefetch_related("cashiers")
    serializer_class = PointOfSaleSerializer
    perms = {"read": ["agencies.view", "cash.operate"], "*": "agencies.manage"}
    filterset_fields = ["agency", "is_active"]
    pagination_class = None
    http_method_names = ["get", "post", "patch"]

    def perform_create(self, serializer):
        self.check_agency(serializer.validated_data["agency"], "agencies.manage")
        pos = serializer.save()
        audit.log(self.request.user, "pos.create", "agency", pos, agency=pos.agency)

    def perform_update(self, serializer):
        self.check_agency(serializer.instance.agency, "agencies.manage")
        before = audit.snapshot(serializer.instance, ["name", "is_active", "default_float"])
        pos = serializer.save()
        audit.log(self.request.user, "pos.update", "agency", pos, agency=pos.agency, before=before,
                  after=audit.snapshot(pos, ["name", "is_active", "default_float"]))


class DeliveryZoneViewSet(AgencyScopedViewSet):
    queryset = DeliveryZone.objects.select_related("agency")
    serializer_class = DeliveryZoneSerializer
    perms = {"read": ["deliveries.view", "agencies.view"], "*": "deliveries.manage"}
    filterset_fields = ["agency", "is_active"]
    pagination_class = None
