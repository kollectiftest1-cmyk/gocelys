from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers

from .models import Notification, PushDevice


class NotificationSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ["id", "kind", "level", "title", "body", "link", "agency", "agency_name", "read_at", "created_at"]


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["level", "kind"]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user).select_related("agency")
        if self.request.query_params.get("unread") == "1":
            qs = qs.filter(read_at__isnull=True)
        return qs

    @action(detail=False)
    def count(self, request):
        return Response({"unread": Notification.objects.filter(user=request.user, read_at__isnull=True).count()})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        Notification.objects.filter(user=request.user, pk=pk).update(read_at=timezone.now())
        return Response(status=204)

    @action(detail=False, methods=["post"])
    def read_all(self, request):
        Notification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=204)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_device(request):
    token = request.data.get("token")
    if not token:
        return Response({"detail": "Jeton manquant."}, status=400)
    PushDevice.objects.update_or_create(token=token, defaults={
        "user": request.user, "platform": request.data.get("platform", ""), "app": request.data.get("app", "entreprise"), "is_active": True})
    return Response(status=204)
