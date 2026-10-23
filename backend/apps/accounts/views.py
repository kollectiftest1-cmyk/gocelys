from django.contrib.auth.hashers import check_password
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core import audit
from apps.core.api import HasPerm

from .catalog import PERMISSIONS, ROLE_PRESETS
from .models import Role, User
from .serializers import LoginSerializer, MeSerializer, RegisterSerializer, RoleSerializer, UserSerializer


class AuthThrottle(ScopedRateThrottle):
    scope = "auth"


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def login(request):
    serializer = LoginSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    user = User.objects.get(pk=serializer.validated_data["user"]["id"])
    audit.log(user, "auth.login", "user", user, agency=user.default_agency)
    return Response(serializer.validated_data)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(serializer.save(), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@throttle_classes([AuthThrottle])
def verify_pin(request):
    """Déverrouillage rapide du POS par code PIN (session déjà authentifiée)."""
    pin = str(request.data.get("pin", ""))
    ok = bool(request.user.pin) and check_password(pin, request.user.pin)
    return Response({"ok": ok}, status=200 if ok else 403)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def logout(request):
    token = request.data.get("refresh")
    if token:
        try:
            RefreshToken(token).blacklist()
        except Exception:
            pass
    return Response(status=204)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        user = request.user
        for field in ("first_name", "last_name", "email"):
            if field in request.data:
                setattr(user, field, request.data[field])
        if request.data.get("new_password"):
            if not user.check_password(request.data.get("current_password", "")):
                return Response({"detail": "Mot de passe actuel incorrect."}, status=400)
            user.set_password(request.data["new_password"])
        user.save()
        return Response(MeSerializer(user).data)


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [HasPerm]
    perms = {"read": "users.view", "write": "users.manage", "*": "users.manage"}
    search_fields = ["username", "first_name", "last_name", "phone", "email"]
    filterset_fields = ["is_active", "default_agency"]
    ordering_fields = ["first_name", "date_joined", "last_login"]

    def get_queryset(self):
        qs = User.objects.filter(kind=User.Kind.STAFF).prefetch_related("role_assignments__role", "role_assignments__agency").order_by("first_name")
        ids = self.request.user.agency_ids("users.view")
        if ids is not None:
            qs = qs.filter(role_assignments__agency__in=ids).distinct()
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role_assignments__role__code=role).distinct()
        return qs

    def perform_create(self, serializer):
        user = serializer.save()
        audit.log(self.request.user, "user.create", "user", user, after={"rôles": user.role_codes()})

    def perform_update(self, serializer):
        before = {"rôles": serializer.instance.role_codes(), "actif": serializer.instance.is_active}
        user = serializer.save()
        user = User.objects.get(pk=user.pk)
        audit.log(self.request.user, "user.update", "user", user, before=before,
                  after={"rôles": user.role_codes(), "actif": user.is_active})

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=["is_active"])
        audit.log(request.user, "user.suspend", "user", user)
        return Response(status=204)


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [HasPerm]
    perms = {"read": "users.view", "write": "roles.manage", "catalog": "users.view", "*": "roles.manage"}
    pagination_class = None

    @action(detail=False)
    def catalog(self, request):
        groups = {}
        labels = {
            "agencies": "Agences", "users": "Utilisateurs", "roles": "Rôles", "settings": "Paramètres",
            "audit": "Journal", "products": "Produits", "prices": "Prix", "stock": "Stock",
            "inventory": "Inventaires", "transfers": "Transferts", "sales": "Ventes POS", "cash": "Caisses",
            "orders": "Commandes", "customers": "Clients", "deliveries": "Livraisons", "finance": "Finances",
            "expenses": "Dépenses", "charges": "Charges", "dashboard": "Pilotage", "reports": "Rapports",
            "promotions": "Promotions",
        }
        for code, label in PERMISSIONS.items():
            module = code.split(".")[0]
            groups.setdefault(module, {"module": module, "label": labels.get(module, module), "permissions": []})
            groups[module]["permissions"].append({"code": code, "label": label})
        return Response({"groups": list(groups.values()), "presets": ROLE_PRESETS})

    def perform_update(self, serializer):
        before = {"permissions": serializer.instance.permissions}
        role = serializer.save()
        audit.log(self.request.user, "role.update", "role", role, before=before, after={"permissions": role.permissions})

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.is_system:
            return Response({"detail": "Un rôle système ne peut pas être supprimé."}, status=409)
        if role.assignments.exists():
            return Response({"detail": "Ce rôle est encore attribué à des utilisateurs."}, status=409)
        audit.log(request.user, "role.delete", "role", role)
        return super().destroy(request, *args, **kwargs)
