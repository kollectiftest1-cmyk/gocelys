from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core import audit
from apps.core.api import HasPerm

from .models import Category, Product, Promotion, ShowcaseSlide, Unit
from .serializers import (CategorySerializer, ProductSerializer, PromotionSerializer, ShowcaseSlideSerializer,
                          UnitSerializer, media_url)

PRICE_FIELDS = {"price", "promo_price", "promo_until"}


class CategoryViewSet(viewsets.ModelViewSet):
    """Catégories à deux niveaux (catégorie › sous-catégorie). Gestion réservée à la direction et à l'admin."""

    serializer_class = CategorySerializer
    permission_classes = [HasPerm]
    perms = {"read": None, "*": "categories.manage"}
    pagination_class = None

    def get_queryset(self):
        return Category.objects.select_related("parent").annotate(
            products_count=Count("products", filter=~Q(products__status="archived")))

    def perform_create(self, serializer):
        c = serializer.save()
        audit.log(self.request.user, "category.create", "product", c, after={"nom": c.name})

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance, ["name", "parent", "is_active", "position"])
        c = serializer.save()
        audit.log(self.request.user, "category.update", "product", c, before=before,
                  after=audit.snapshot(c, ["name", "parent", "is_active", "position"]))

    def destroy(self, request, *args, **kwargs):
        c = self.get_object()
        if c.products.exists():
            return Response({"detail": f"« {c.name} » contient {c.products.count()} produit(s). Déplacez-les ou désactivez la catégorie."}, status=409)
        if c.children.exists():
            return Response({"detail": "Supprimez ou déplacez d'abord ses sous-catégories."}, status=409)
        audit.log(request.user, "category.delete", "product", c)
        c.delete()
        return Response(status=204)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        """{"order": [id, id, ...]} — positions dans l'ordre donné."""
        for i, pk in enumerate(request.data.get("order", [])):
            Category.objects.filter(pk=pk).update(position=i)
        return Response(status=204)


class UnitViewSet(viewsets.ModelViewSet):
    serializer_class = UnitSerializer
    permission_classes = [HasPerm]
    perms = {"read": None, "*": "categories.manage"}
    pagination_class = None

    def get_queryset(self):
        return Unit.objects.all()

    def list(self, request, *args, **kwargs):
        from .models import Product, ProductUnit

        data = UnitSerializer(self.get_queryset(), many=True).data
        base = {r["base_unit"]: r["n"] for r in Product.objects.exclude(status="archived").values("base_unit").annotate(n=Count("id"))}
        packs = {r["unit"]: r["n"] for r in ProductUnit.objects.exclude(product__status="archived").values("unit").annotate(n=Count("product", distinct=True))}
        for row in data:
            row["products_count"] = max(base.get(row["id"], 0), packs.get(row["id"], 0))
        return Response(data)

    def perform_create(self, serializer):
        u = serializer.save()
        audit.log(self.request.user, "unit.create", "product", u)

    def destroy(self, request, *args, **kwargs):
        from .models import Product, ProductUnit

        u = self.get_object()
        if Product.objects.filter(base_unit=u).exists() or ProductUnit.objects.filter(unit=u).exists():
            return Response({"detail": f"L'unité « {u.name} » est utilisée par des produits : elle ne peut pas être supprimée."}, status=409)
        audit.log(request.user, "unit.delete", "product", u)
        u.delete()
        return Response(status=204)


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [HasPerm]
    perms = {"read": "products.view", "lookup": "products.view", "destroy": "products.delete", "*": "products.manage"}
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ["name", "code", "reference", "barcode", "units__barcode"]
    filterset_fields = ["category", "status", "sold_online"]
    ordering_fields = ["name", "price", "code", "created_at"]

    def get_queryset(self):
        qs = Product.objects.select_related("category", "base_unit").prefetch_related("units__unit").distinct()
        if self.request.query_params.get("archived") != "1" and self.action == "list" and not self.request.query_params.get("status"):
            qs = qs.exclude(status=Product.Status.ARCHIVED)
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        agency = request.query_params.get("stock_agency")
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        if agency is not None:
            from apps.inventory.models import StockBalance

            ids = [r["id"] for r in rows]
            qs = StockBalance.objects.filter(product_id__in=ids)
            if agency != "all":
                qs = qs.filter(agency_id=agency)
            agg = {}
            for b in qs:
                agg.setdefault(b.product_id, {})
                agg[b.product_id][b.bucket] = agg[b.product_id].get(b.bucket, 0) + float(b.quantity)
            for r in rows:
                r["stock"] = agg.get(r["id"], {})
        return response

    def _check_price_change(self, serializer):
        touched = PRICE_FIELDS & set(serializer.validated_data)
        units = serializer.validated_data.get("units")
        if (touched or units is not None) and not self.request.user.has_code("prices.manage"):
            from rest_framework.exceptions import PermissionDenied

            if serializer.instance is None:
                return
            for f in touched:
                if getattr(serializer.instance, f) != serializer.validated_data[f]:
                    raise PermissionDenied("La modification des prix nécessite la permission « prices.manage ».")

    def perform_create(self, serializer):
        product = serializer.save()
        audit.log(self.request.user, "product.create", "product", product,
                  after=audit.snapshot(product, ["code", "name", "price", "category"]))

    def perform_update(self, serializer):
        self._check_price_change(serializer)
        before = audit.snapshot(serializer.instance)
        before_units = {u.pk: float(u.price) for u in serializer.instance.units.all()}
        product = serializer.save()
        after = audit.snapshot(product)
        after_units = {u.pk: float(u.price) for u in product.units.all()}
        kind = "price" if any(before.get(f) != after.get(f) for f in PRICE_FIELDS) or before_units != after_units else "product"
        audit.log(self.request.user, f"{kind}.update", kind, product, before={**before, "prix_conditionnements": before_units},
                  after={**after, "prix_conditionnements": after_units})

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        product.status = Product.Status.ARCHIVED
        product.save(update_fields=["status"])
        audit.log(request.user, "product.archive", "product", product)
        return Response(status=204)

    @action(detail=False)
    def lookup(self, request):
        """Recherche par code-barres (scan POS) sur produit ou conditionnement."""
        code = request.query_params.get("barcode", "").strip()
        product = Product.objects.filter(Q(barcode=code) | Q(units__barcode=code)).distinct().first()
        if not product:
            return Response({"detail": "Aucun produit pour ce code-barres."}, status=404)
        unit = product.units.filter(barcode=code).first()
        data = ProductSerializer(product, context={"request": request}).data
        data["matched_unit"] = unit.pk if unit else None
        return Response(data)


    @action(detail=True, methods=["post", "delete"], parser_classes=[MultiPartParser, FormParser])
    def image(self, request, pk=None):
        """POST (multipart, champ `file`) : remplace la photo. DELETE : la retire (retour à l'illustration)."""
        from . import images

        product = self.get_object()
        old = product.image.name if product.image else None  # le nom, pas l'objet : il change au save()
        if request.method == "DELETE":
            product.image, product.image_cutout = None, False
            product.save(update_fields=["image", "image_cutout", "updated_at"])
            images.delete_file(old)
            audit.log(request.user, "product.image_remove", "product", product)
        else:
            content, cutout, size = images.process(request.FILES.get("file"))
            product.image.save(content.name, content, save=False)
            product.image_cutout = cutout
            product.save(update_fields=["image", "image_cutout", "updated_at"])
            if old:
                images.delete_file(old)
            audit.log(request.user, "product.image", "product", product,
                      after={"taille": f"{size[0]}×{size[1]}", "détourée": cutout})
        return Response(ProductSerializer(product, context={"request": request}).data)


class ShowcaseViewSet(viewsets.ModelViewSet):
    """Univers de la vitrine 3D de l'accueil public — direction et administrateur (site.manage)."""

    serializer_class = ShowcaseSlideSerializer
    permission_classes = [HasPerm]
    perms = {"*": "site.manage"}
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None
    queryset = ShowcaseSlide.objects.select_related("category")

    def perform_create(self, serializer):
        last = ShowcaseSlide.objects.order_by("-position").first()
        slide = serializer.save(position=(last.position + 1) if last else 0)
        audit.log(self.request.user, "site.slide_create", "settings", slide, after={"univers": slide.word})

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance, ["word", "title", "model", "color", "is_active"])
        slide = serializer.save()
        audit.log(self.request.user, "site.slide_update", "settings", slide, before=before,
                  after=audit.snapshot(slide, ["word", "title", "model", "color", "is_active"]))

    def destroy(self, request, *args, **kwargs):
        from . import images

        slide = self.get_object()
        if slide.is_active and not ShowcaseSlide.objects.filter(is_active=True).exclude(pk=slide.pk).exists():
            return Response({"detail": "La vitrine doit garder au moins un univers actif."}, status=409)
        images.delete_file(slide.image)
        audit.log(request.user, "site.slide_delete", "settings", slide, before={"univers": slide.word})
        slide.delete()
        return Response(status=204)

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        for i, pk in enumerate(request.data.get("order", [])):
            ShowcaseSlide.objects.filter(pk=pk).update(position=i)
        return Response(status=204)

    @action(detail=False, methods=["get", "post"])
    def featured(self, request):
        """GET : produits vendables en ligne et leur mise en avant. POST {product, featured} : bascule."""
        MAX = 12
        if request.method == "POST":
            product = Product.objects.filter(pk=request.data.get("product")).first()
            if not product:
                return Response({"detail": "Produit introuvable."}, status=404)
            featured = bool(request.data.get("featured"))
            if featured and not product.is_featured and Product.objects.filter(is_featured=True, status="active").count() >= MAX:
                return Response({"detail": f"{MAX} produits mis en avant au maximum : retirez-en un d'abord."}, status=409)
            product.is_featured = featured
            product.save(update_fields=["is_featured", "updated_at"])
            audit.log(request.user, "site.featured", "product", product, after={"mis_en_avant": featured})
        qs = Product.objects.filter(status="active").select_related("category")
        return Response({"max": MAX, "products": [
            {"id": p.id, "name": p.name, "category_name": p.category.name, "accent": p.accent, "visual": p.visual,
             "image": media_url(request, p.image), "image_cutout": p.image_cutout, "is_featured": p.is_featured,
             "sold_online": p.sold_online} for p in qs]})


class PromotionViewSet(viewsets.ModelViewSet):
    queryset = Promotion.objects.prefetch_related("agencies")
    serializer_class = PromotionSerializer
    permission_classes = [HasPerm]
    perms = {"read": ["promotions.manage", "sales.create"], "*": "promotions.manage"}
    search_fields = ["code", "label"]
