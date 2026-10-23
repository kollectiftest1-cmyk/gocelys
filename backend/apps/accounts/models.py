from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models

from apps.core.models import BaseModel

from .catalog import PERMISSIONS


class UserManager(DjangoUserManager):
    def create_user(self, username=None, email=None, password=None, **extra):
        username = username or extra.get("phone") or email
        return super().create_user(username, email, password, **extra)


class User(AbstractUser):
    class Kind(models.TextChoices):
        STAFF = "staff", "Personnel"
        CUSTOMER = "customer", "Client"

    phone = models.CharField("téléphone", max_length=32, blank=True, db_index=True)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.STAFF)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    default_agency = models.ForeignKey(
        "agencies.Agency", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    pin = models.CharField(max_length=128, blank=True, help_text="Code PIN POS (haché)")
    assigned_pos = models.ForeignKey(
        "agencies.PointOfSale", null=True, blank=True, on_delete=models.SET_NULL, related_name="cashiers",
        verbose_name="caisse affectée", help_text="Caisse sur laquelle ce caissier travaille",
    )

    objects = UserManager()

    class Meta:
        verbose_name = "utilisateur"

    def __str__(self):
        return self.get_full_name() or self.username

    # ---------------- RBAC ----------------
    def _assignments(self):
        if not hasattr(self, "_rbac_cache"):
            rows = list(self.role_assignments.select_related("role").filter(role__is_active=True))
            self._rbac_cache = rows
        return self._rbac_cache

    def permission_codes(self, agency_id=None):
        """Codes autorisés, globalement + pour l'agence donnée."""
        if self.is_superuser:
            return set(PERMISSIONS)
        codes = set()
        for a in self._assignments():
            if a.agency_id is None or agency_id is None or a.agency_id == agency_id:
                codes.update(a.role.permissions or [])
        return codes

    def has_code(self, code, agency_id=None):
        if not self.is_active:
            return False
        if self.is_superuser:
            return True
        for a in self._assignments():
            if code in (a.role.permissions or []):
                if a.agency_id is None or agency_id is None or a.agency_id == agency_id:
                    return True
        return False

    def is_global(self, code=None):
        """L'utilisateur a-t-il une affectation globale (toutes agences) ?"""
        if self.is_superuser:
            return True
        return any(
            a.agency_id is None and (code is None or code in (a.role.permissions or []))
            for a in self._assignments()
        )

    def agency_ids(self, code=None):
        """Agences accessibles. None = toutes."""
        if self.is_global(code):
            return None
        ids = set()
        for a in self._assignments():
            if a.agency_id and (code is None or code in (a.role.permissions or [])):
                ids.add(a.agency_id)
        if not ids and self.default_agency_id and code is None:
            ids.add(self.default_agency_id)
        return ids

    def role_codes(self):
        return sorted({a.role.code for a in self._assignments()})


class Role(BaseModel):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    scope = models.CharField(max_length=10, choices=[("global", "Global"), ("agency", "Agence")], default="agency")
    permissions = models.JSONField(default=list, blank=True)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "rôle"

    def __str__(self):
        return self.name


class UserRole(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="assignments")
    agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.CASCADE, related_name="role_assignments")

    class Meta:
        unique_together = [("user", "role", "agency")]
        verbose_name = "affectation de rôle"

    def __str__(self):
        where = self.agency.name if self.agency_id else "toutes agences"
        return f"{self.user} — {self.role} ({where})"
