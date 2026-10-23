from decimal import Decimal

from rest_framework import serializers

import re

from .models import Category, Product, ProductUnit, Promotion, ShowcaseSlide, Unit


class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=0)
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)

    class Meta:
        model = Category
        fields = ["id", "name", "description", "parent", "parent_name", "icon", "color", "position", "is_active", "products_count"]

    def validate(self, attrs):
        parent = attrs.get("parent")
        if parent is not None:
            if self.instance and parent.pk == self.instance.pk:
                raise serializers.ValidationError({"parent": "Une catégorie ne peut pas être sa propre parente."})
            if parent.parent_id:
                raise serializers.ValidationError({"parent": "Deux niveaux maximum : choisissez une catégorie principale."})
            if self.instance and self.instance.children.exists():
                raise serializers.ValidationError({"parent": "Cette catégorie a déjà des sous-catégories : elle doit rester principale."})
        name = (attrs.get("name") or getattr(self.instance, "name", "")).strip()
        qs = Category.objects.filter(name__iexact=name, parent=parent if "parent" in attrs else getattr(self.instance, "parent", None))
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"name": "Une catégorie porte déjà ce nom à ce niveau."})
        return attrs


def media_url(request, field):
    if not field:
        return None
    return request.build_absolute_uri(field.url) if request else field.url


class UnitSerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Unit
        fields = ["id", "code", "name", "plural", "products_count"]

    def validate_code(self, value):
        from django.utils.text import slugify

        code = slugify(value)[:20]
        if not code:
            raise serializers.ValidationError("Code invalide.")
        return code


class ProductUnitSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    current_price = serializers.SerializerMethodField()

    class Meta:
        model = ProductUnit
        fields = ["id", "unit", "unit_name", "factor", "price", "promo_price", "current_price", "barcode", "is_default"]

    def get_current_price(self, obj):
        return obj.current_price()


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    base_unit_name = serializers.CharField(source="base_unit.name", read_only=True)
    units = ProductUnitSerializer(many=True, required=False)
    current_price = serializers.SerializerMethodField()
    stock = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["id", "code", "reference", "name", "category", "category_name", "description", "base_unit",
                  "base_unit_name", "price", "promo_price", "promo_until", "current_price", "min_stock", "max_stock",
                  "image", "image_cutout", "barcode", "status", "status_label", "sold_online", "accent", "visual", "is_featured", "units", "stock",
                  "created_at", "updated_at"]

    def get_current_price(self, obj):
        return obj.current_price()

    def get_image(self, obj):
        return media_url(self.context.get("request"), obj.image)

    def get_stock(self, obj):
        balances = getattr(obj, "_stock", None)
        return balances

    def validate(self, attrs):
        units = attrs.get("units") or []
        base = attrs.get("base_unit") or getattr(self.instance, "base_unit", None)
        for u in units:
            if u.get("factor") is None or Decimal(u["factor"]) <= 0:
                raise serializers.ValidationError({"units": "Chaque conditionnement doit avoir un facteur positif."})
            if base and u["unit"].pk == base.pk and Decimal(u["factor"]) != 1:
                raise serializers.ValidationError({"units": "L'unité de base a toujours un facteur de 1."})
        return attrs

    def _save_units(self, product, units):
        if units is None:
            return
        keep = []
        for u in units:
            uid = u.pop("id", None)
            obj = product.units.filter(pk=uid).first() if uid else product.units.filter(unit=u["unit"]).first()
            if obj:
                for k, v in u.items():
                    setattr(obj, k, v)
                obj.save()
            else:
                obj = ProductUnit.objects.create(product=product, **u)
            keep.append(obj.pk)
        product.units.exclude(pk__in=keep).delete()
        if not product.units.filter(unit=product.base_unit).exists():
            ProductUnit.objects.create(product=product, unit=product.base_unit, factor=1, price=product.price,
                                       barcode=product.barcode, is_default=not product.units.exists())

    def create(self, validated):
        units = validated.pop("units", [])
        product = Product.objects.create(**validated)
        self._save_units(product, units)
        return product

    def update(self, instance, validated):
        units = validated.pop("units", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        base = instance.units.filter(unit=instance.base_unit).first()
        if base and units is None:
            base.price = instance.price
            base.save(update_fields=["price"])
        self._save_units(instance, units)
        return instance


class PromotionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Promotion
        fields = ["id", "code", "label", "kind", "value", "min_amount", "starts_on", "ends_on", "max_uses", "used",
                  "agencies", "is_active"]
        read_only_fields = ["used"]


HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


class ShowcaseSlideSerializer(serializers.ModelSerializer):
    """Univers de la vitrine. L'image (modèle « photo ») arrive en multipart dans `upload`."""

    image = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    model_label = serializers.CharField(source="get_model_display", read_only=True)
    upload = serializers.ImageField(write_only=True, required=False)
    remove_image = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = ShowcaseSlide
        fields = ["id", "word", "title", "text", "color", "model", "model_label", "label_title", "label_sub", "image",
                  "category", "category_name", "position", "is_active", "upload", "remove_image"]

    def get_image(self, obj):
        return media_url(self.context.get("request"), obj.image)

    def validate_color(self, value):
        if not HEX.match(value or ""):
            raise serializers.ValidationError("Couleur au format #RRGGBB.")
        return value.upper()

    def validate_word(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Le mot est obligatoire.")
        return value

    def validate(self, attrs):
        from . import images

        upload = attrs.pop("upload", None)
        remove = attrs.pop("remove_image", False)
        if upload is not None:
            content, _cutout, _size = images.process(upload, min_side=300, min_height=900, require_cutout=True, max_side=1400)
            attrs["image"] = content
        elif remove:
            attrs["image"] = None
        model = attrs.get("model", getattr(self.instance, "model", None))
        has_image = attrs["image"] if "image" in attrs else getattr(self.instance, "image", None)
        if model == ShowcaseSlide.Model.PHOTO and not has_image:
            raise serializers.ValidationError({"upload": "Ajoutez la photo détourée du produit, ou choisissez un modèle 3D."})
        active = attrs.get("is_active", getattr(self.instance, "is_active", True))
        others = ShowcaseSlide.objects.filter(is_active=True)
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        if active and others.count() >= ShowcaseSlide.MAX_ACTIVE:
            raise serializers.ValidationError({"is_active": f"{ShowcaseSlide.MAX_ACTIVE} univers actifs au maximum : désactivez-en un d'abord."})
        if not active and not others.exists():
            raise serializers.ValidationError({"is_active": "La vitrine doit garder au moins un univers actif."})
        return attrs

    def update(self, instance, validated):
        old = instance.image.name if ("image" in validated and instance.image) else None
        obj = super().update(instance, validated)
        if old and old != (obj.image.name if obj.image else None):
            from . import images

            images.delete_file(old)
        return obj
