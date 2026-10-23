"""Briques DRF partagées : permissions par code, périmètre agence, erreurs métier."""
from rest_framework import exceptions, permissions, viewsets


class BusinessError(exceptions.APIException):
    """Règle métier non respectée (stock insuffisant, caisse fermée…)."""

    status_code = 409
    default_code = "business_rule"
    default_detail = "Opération refusée par une règle de gestion."

    def __init__(self, detail=None, code=None, **extra):
        super().__init__(detail, code)
        self.extra = extra


class HasPerm(permissions.BasePermission):
    """
    Vérifie le code de permission requis pour l'action courante.

    Le ViewSet déclare `perms = {"list": "stock.view", "create": "stock.adjust", "*": "..."}`.
    Valeur None = authentification seule.
    """

    message = "Vous n'avez pas la permission d'effectuer cette action."

    def required(self, view):
        perms = getattr(view, "perms", {}) or {}
        action = getattr(view, "action", None) or view.request.method.lower()
        if action in perms:
            return perms[action]
        if action in {"list", "retrieve"} and "read" in perms:
            return perms["read"]
        if action in {"create", "update", "partial_update", "destroy"} and "write" in perms:
            return perms["write"]
        return perms.get("*", "__deny__" if perms else None)

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        code = self.required(view)
        if code is None:
            return True
        if code == "__deny__":
            return user.is_superuser
        codes = code if isinstance(code, (list, tuple)) else [code]
        return any(user.has_code(c) for c in codes)


class AgencyScopedViewSet(viewsets.ModelViewSet):
    """
    Restreint le queryset aux agences autorisées de l'utilisateur.
    `agency_field` = chemin vers l'agence (ex. "agency", "order__agency").
    `?agency=<id>` filtre sur une agence précise.
    """

    permission_classes = [HasPerm]
    agency_field = "agency"
    perms = {}

    def scope_code(self):
        return HasPerm().required(self)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        code = self.scope_code()
        codes = list(code) if isinstance(code, (list, tuple)) else [code]
        ids = set()
        for c in codes:
            part = user.agency_ids(c if c and c != "__deny__" else None)
            if part is None:
                ids = None
                break
            ids |= part
        if self.agency_field:
            if ids is not None:
                qs = qs.filter(**{f"{self.agency_field}__in": ids})
            agency = self.request.query_params.get("agency")
            if agency and agency.isdigit():
                qs = qs.filter(**{self.agency_field: int(agency)})
        return qs

    def check_agency(self, agency, code):
        """Refuse si l'utilisateur n'a pas `code` sur `agency`."""
        agency_id = getattr(agency, "pk", agency)
        if not self.request.user.has_code(code, agency_id):
            raise exceptions.PermissionDenied("Action non autorisée pour cette agence.")
        ids = self.request.user.agency_ids(code)
        if ids is not None and agency_id not in ids:
            raise exceptions.PermissionDenied("Cette agence ne fait pas partie de votre périmètre.")


def require(user, code, agency=None):
    agency_id = getattr(agency, "pk", agency)
    if not user.has_code(code, agency_id):
        raise exceptions.PermissionDenied(f"Permission requise : {code}.")
    if agency_id is not None:
        ids = user.agency_ids(code)
        if ids is not None and agency_id not in ids:
            raise exceptions.PermissionDenied("Cette agence ne fait pas partie de votre périmètre.")
