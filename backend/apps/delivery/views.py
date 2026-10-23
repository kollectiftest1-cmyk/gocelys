from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.api import AgencyScopedViewSet, BusinessError

from . import services
from .models import Delivery, Driver
from .serializers import DeliverySerializer, DriverSerializer

ACTIVE = ["assigned", "accepted", "picked_up", "en_route"]


class DriverViewSet(AgencyScopedViewSet):
    serializer_class = DriverSerializer
    perms = {"read": ["deliveries.view", "deliveries.manage"], "*": "deliveries.manage"}
    filterset_fields = ["agency", "is_available", "is_active"]
    pagination_class = None
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        today = timezone.localdate()
        self.queryset = Driver.objects.select_related("user", "agency").annotate(
            active_deliveries=Count("deliveries", filter=Q(deliveries__status__in=ACTIVE)),
            delivered_today=Count("deliveries", filter=Q(deliveries__status="delivered", deliveries__arrived_at__date=today)),
        )
        return super().get_queryset()


class DeliveryViewSet(AgencyScopedViewSet):
    queryset = Delivery.objects.select_related("order__customer", "order__payment_method", "driver__user", "agency", "zone").prefetch_related("order__lines")
    serializer_class = DeliverySerializer
    perms = {"read": ["deliveries.view", "deliveries.manage"]}
    filterset_fields = ["agency", "status", "driver"]
    search_fields = ["reference", "order__reference", "order__customer__name"]
    http_method_names = ["get"]


class MyDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    """Espace livreur : ses livraisons, mise à jour du statut, preuve."""

    serializer_class = DeliverySerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None

    def get_queryset(self):
        driver = getattr(self.request.user, "driver", None)
        if driver is None:
            return Delivery.objects.none()
        qs = Delivery.objects.filter(driver=driver).select_related("order__customer", "order__payment_method", "agency", "zone").prefetch_related("order__lines")
        scope = self.request.query_params.get("scope", "active")
        if scope == "active":
            qs = qs.filter(status__in=ACTIVE)
        elif scope == "today":
            qs = qs.filter(Q(status__in=ACTIVE) | Q(arrived_at__date=timezone.localdate()))
        return qs.order_by("status", "assigned_at")

    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        d = services.driver_update(self.get_object(), request.user, request.data.get("status"), request.data.get("note", ""),
                                   request.data.get("latitude"), request.data.get("longitude"))
        return Response(DeliverySerializer(d, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        d = services.confirm(self.get_object(), request.user, method=request.data.get("method", "otp"),
                             otp=request.data.get("otp"), photo=request.FILES.get("photo"),
                             signature=request.data.get("signature", ""), note=request.data.get("note", ""))
        return Response(DeliverySerializer(d, context={"request": request}).data)

    @action(detail=False, methods=["post"])
    def availability(self, request):
        driver = getattr(request.user, "driver", None)
        if driver is None:
            raise BusinessError("Profil livreur introuvable.")
        driver.is_available = bool(request.data.get("is_available", True))
        driver.save(update_fields=["is_available"])
        return Response({"is_available": driver.is_available})

    @action(detail=False)
    def summary(self, request):
        driver = getattr(request.user, "driver", None)
        if driver is None:
            return Response({})
        today = timezone.localdate()
        done = Delivery.objects.filter(driver=driver, status="delivered", arrived_at__date=today)
        return Response({
            "active": Delivery.objects.filter(driver=driver, status__in=ACTIVE).count(),
            "delivered_today": done.count(),
            "cash_collected_today": sum(d.cash_collected for d in done),
            "is_available": driver.is_available,
            "agency": driver.agency.name,
        })
