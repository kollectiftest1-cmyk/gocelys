import django_filters
from django.conf import settings as dj_settings
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import audit
from .api import AgencyScopedViewSet, require
from .models import AuditLog, Setting
from .serializers import AuditLogSerializer

SETTING_LABELS = {
    "currency": "Devise de référence",
    "usd_rate": "Taux du jour (1 USD en CDF)",
    "expense_approval_threshold": "Seuil de validation des dépenses (CDF)",
    "cash_difference_alert": "Écart de caisse déclenchant une alerte (CDF)",
    "order_assignment": "Affectation des commandes",
    "loyalty_points_per": "1 point de fidélité tous les … CDF",
    "session_max_hours": "Caisse non clôturée après … heures",
    "delivery_late_minutes": "Livraison en retard après … minutes",
}


class AuditFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name="at", lookup_expr="date__gte")
    until = django_filters.DateFilter(field_name="at", lookup_expr="date__lte")

    class Meta:
        model = AuditLog
        fields = ["agency", "user", "action", "entity_type", "sensitive", "since", "until"]


class AuditLogViewSet(AgencyScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("user", "agency")
    serializer_class = AuditLogSerializer
    perms = {"*": "audit.view"}
    filterset_class = AuditFilter
    search_fields = ["entity_label", "action", "note", "entity_id"]
    http_method_names = ["get"]

    def get_queryset(self):
        qs = super(AgencyScopedViewSet, self).get_queryset()
        ids = self.request.user.agency_ids("audit.view")
        if ids is not None:
            qs = qs.filter(agency__in=ids)
        return qs


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def settings_view(request):
    if request.method == "PATCH":
        require(request.user, "settings.manage")
        before = Setting.all_values()
        for key, value in request.data.items():
            if key in dj_settings.GOCELSYS_DEFAULTS:
                Setting.objects.update_or_create(key=key, defaults={"value": value, "label": SETTING_LABELS.get(key, "")})
        audit.log(request.user, "settings.update", "settings", entity_id="settings", label="Paramètres",
                  before=before, after=Setting.all_values())
    values = Setting.all_values()
    return Response({"values": values, "labels": SETTING_LABELS})
