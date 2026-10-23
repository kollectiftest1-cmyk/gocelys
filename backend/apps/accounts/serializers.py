from django.contrib.auth import authenticate
from django.contrib.auth.hashers import make_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .backends import normalize_phone
from .catalog import PERMISSIONS
from .models import Role, User, UserRole


class RoleSerializer(serializers.ModelSerializer):
    users_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "code", "name", "description", "scope", "permissions", "is_system", "is_active", "users_count"]
        read_only_fields = ["is_system"]

    def get_users_count(self, obj):
        return obj.assignments.values("user").distinct().count()

    def validate_permissions(self, value):
        unknown = [code for code in value if code not in PERMISSIONS]
        if unknown:
            raise serializers.ValidationError(f"Permissions inconnues : {', '.join(unknown)}")
        return sorted(set(value))


class UserRoleSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.name", read_only=True)
    role_code = serializers.CharField(source="role.code", read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True, default=None)

    class Meta:
        model = UserRole
        fields = ["id", "role", "role_code", "role_name", "agency", "agency_name"]


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    assignments = UserRoleSerializer(source="role_assignments", many=True, read_only=True)
    roles = serializers.ListField(child=serializers.DictField(), write_only=True, required=False,
                                  help_text='[{"role": 3, "agency": 1}]')
    password = serializers.CharField(write_only=True, required=False, min_length=6)
    pin_code = serializers.CharField(write_only=True, required=False, min_length=4, max_length=6)
    default_agency_name = serializers.CharField(source="default_agency.name", read_only=True, default=None)
    assigned_pos_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name", "email", "phone", "kind", "is_active",
                  "default_agency", "default_agency_name", "assigned_pos", "assigned_pos_name", "assignments", "roles",
                  "password", "pin_code", "last_login", "date_joined"]

    def get_assigned_pos_name(self, obj):
        return str(obj.assigned_pos) if obj.assigned_pos_id else None

    def validate(self, attrs):
        pos = attrs.get("assigned_pos")
        if pos is not None:
            roles = attrs.get("roles")
            if roles is not None:
                agencies = {int(r["agency"]) for r in roles if r.get("agency")}
            elif self.instance:
                agencies = set(self.instance.role_assignments.exclude(agency=None).values_list("agency_id", flat=True))
            else:
                agencies = set()
            if pos.agency_id not in agencies:
                raise serializers.ValidationError({"assigned_pos": "La caisse doit appartenir à une agence où la personne a un rôle."})
            if not pos.is_active:
                raise serializers.ValidationError({"assigned_pos": "Cette caisse est désactivée."})
        return attrs
        read_only_fields = ["last_login", "date_joined", "kind"]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def validate_phone(self, value):
        return normalize_phone(value) if value else value

    def _apply_roles(self, user, roles):
        if roles is None:
            return
        user.role_assignments.all().delete()
        for item in roles:
            role = Role.objects.get(pk=item["role"])
            agency = item.get("agency") if role.scope == "agency" else None
            UserRole.objects.get_or_create(user=user, role=role, agency_id=agency)
            if role.code == "driver" and agency:
                # Un livreur a besoin d'une fiche livreur rattachée à son agence pour recevoir des livraisons.
                from apps.delivery.models import Driver

                Driver.objects.update_or_create(user=user, defaults={"agency_id": agency, "is_active": True})

    def create(self, validated):
        roles = validated.pop("roles", None)
        password = validated.pop("password", None)
        pin = validated.pop("pin_code", None)
        user = User(**validated)
        if not password:
            raise serializers.ValidationError({"password": "Le mot de passe initial est obligatoire."})
        user.set_password(password)
        if pin:
            user.pin = make_password(pin)
        user.save()
        self._apply_roles(user, roles)
        return user

    def update(self, instance, validated):
        roles = validated.pop("roles", None)
        password = validated.pop("password", None)
        pin = validated.pop("pin_code", None)
        for key, value in validated.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        if pin:
            instance.pin = make_password(pin)
        instance.save()
        self._apply_roles(instance, roles)
        return instance


class MeSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    agencies = serializers.SerializerMethodField()
    is_global = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    driver = serializers.SerializerMethodField()
    assigned_pos = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name", "email", "phone", "kind",
                  "default_agency", "permissions", "roles", "agencies", "is_global", "customer", "driver", "assigned_pos"]

    def get_assigned_pos(self, obj):
        p = obj.assigned_pos
        if p is None:
            return None
        return {"id": p.id, "code": p.code, "name": p.name, "agency": p.agency_id, "agency_name": p.agency.name,
                "default_float": float(p.default_float), "is_active": p.is_active}

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_permissions(self, obj):
        return sorted(obj.permission_codes())

    def get_roles(self, obj):
        return obj.role_codes()

    def get_is_global(self, obj):
        return obj.is_global()

    def get_agencies(self, obj):
        from apps.agencies.models import Agency

        ids = obj.agency_ids()
        qs = Agency.objects.all() if ids is None else Agency.objects.filter(pk__in=ids)
        return [{"id": a.id, "code": a.code, "name": a.name, "status": a.status} for a in qs]

    def get_customer(self, obj):
        c = getattr(obj, "customer", None)
        return {"id": c.id, "name": c.name, "phone": c.phone, "loyalty_points": c.loyalty_points,
                "preferred_agency": c.preferred_agency_id} if c else None

    def get_driver(self, obj):
        d = getattr(obj, "driver", None)
        return {"id": d.id, "agency": d.agency_id, "vehicle": d.vehicle, "is_available": d.is_available} if d else None


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField()

    def validate(self, attrs):
        user = authenticate(self.context.get("request"), username=attrs["identifier"], password=attrs["password"])
        if user is None:
            raise serializers.ValidationError({"detail": "Identifiant ou mot de passe incorrect."})
        refresh = RefreshToken.for_user(user)
        return {"access": str(refresh.access_token), "refresh": str(refresh), "user": MeSerializer(user).data}


class RegisterSerializer(serializers.Serializer):
    """Inscription client (app extérieure)."""

    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(min_length=6)

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if len(phone) < 9:
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("Un compte existe déjà avec ce numéro.")
        return phone

    def create(self, data):
        from apps.orders.models import Customer

        first, _, last = data["name"].strip().partition(" ")
        user = User.objects.create_user(username=data["phone"], email=data.get("email", ""), password=data["password"],
                                        phone=data["phone"], first_name=first, last_name=last, kind=User.Kind.CUSTOMER)
        customer = Customer.objects.filter(phone=data["phone"], user__isnull=True).first()
        if customer:
            customer.user, customer.name = user, data["name"]
            customer.save()
        else:
            Customer.objects.create(user=user, name=data["name"], phone=data["phone"], email=data.get("email", ""))
        refresh = RefreshToken.for_user(user)
        return {"access": str(refresh.access_token), "refresh": str(refresh), "user": MeSerializer(user).data}
