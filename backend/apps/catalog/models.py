from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.core.utils import fmt_qty
from apps.core.models import BaseModel, money_field


class Category(BaseModel):
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=200, blank=True)
    color = models.CharField(max_length=9, blank=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    icon = models.CharField(max_length=40, blank=True, help_text="Nom d'icône (droplet, bottle, ...)")
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "name"]
        verbose_name = "catégorie"

    def __str__(self):
        return f"{self.parent.name} › {self.name}" if self.parent_id else self.name


class Unit(BaseModel):
    """Unité de vente : pièce, bouteille, pack, carton, caisse, sac…"""

    code = models.SlugField(max_length=20, unique=True)
    name = models.CharField(max_length=40)
    plural = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "unité"

    def __str__(self):
        return self.name


class Product(BaseModel):
    class Visual(models.TextChoices):
        BOTTLE = "bottle", "Bouteille"
        JUG = "jug", "Bidon / fontaine"
        CAN = "can", "Canette"
        SACHET = "sachet", "Sachet"
        BOX = "box", "Boîte (mouchoirs…)"
        ROLL = "roll", "Rouleaux"
        PACK = "pack", "Paquet / carton"
        SACK = "sack", "Sac"
        JAR = "jar", "Pot / flacon"
        BAR = "bar", "Pain de savon"

    class Status(models.TextChoices):
        ACTIVE = "active", "Actif"
        INACTIVE = "inactive", "Inactif"
        ARCHIVED = "archived", "Archivé"

    code = models.CharField(max_length=30, unique=True)
    reference = models.CharField(max_length=60, blank=True)
    name = models.CharField(max_length=160)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    description = models.TextField(blank=True)
    base_unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="+", help_text="Unité de stock (la plus petite)")
    price = money_field(help_text="Prix de vente de l'unité de base")
    promo_price = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    promo_until = models.DateField(null=True, blank=True)
    min_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0, help_text="Seuil minimum (unités de base)")
    max_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    image = models.ImageField(upload_to="products/", blank=True, null=True)
    barcode = models.CharField(max_length=64, blank=True, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    sold_online = models.BooleanField(default=True)
    accent = models.CharField(max_length=9, blank=True, help_text="Couleur d'étiquette (POS, app client, site)")
    visual = models.CharField(max_length=10, choices=Visual.choices, default=Visual.PACK,
                              help_text="Forme utilisée pour l'illustration 2D/3D quand il n'y a pas de photo")
    is_featured = models.BooleanField(default=False, help_text="Mis en avant sur le site public")
    image_cutout = models.BooleanField(default=False, help_text="Photo détourée (fond transparent)")

    class Meta:
        ordering = ["category__position", "name"]
        verbose_name = "produit"

    def __str__(self):
        return self.name

    def current_price(self, at=None):
        at = at or timezone.localdate()
        if self.promo_price is not None and (self.promo_until is None or self.promo_until >= at):
            return self.promo_price
        return self.price


class ProductUnit(BaseModel):
    """
    Conditionnement vendable et sa conversion vers l'unité de base.
    Ex. Carton = 24 bouteilles → factor = 24. Le stock est toujours tenu en unité de base.
    """

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="units")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="+")
    factor = models.DecimalField(max_digits=12, decimal_places=3, help_text="Nombre d'unités de base")
    price = money_field()
    promo_price = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    barcode = models.CharField(max_length=64, blank=True, db_index=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        unique_together = [("product", "unit")]
        ordering = ["factor"]
        verbose_name = "conditionnement"

    def __str__(self):
        return f"{self.product.name} — {self.unit.name} ({fmt_qty(self.factor)})"

    def clean(self):
        if self.factor is None or self.factor <= 0:
            raise ValidationError({"factor": "Le facteur de conversion doit être positif."})
        if self.unit_id == self.product.base_unit_id and self.factor != Decimal(1):
            raise ValidationError({"factor": "L'unité de base a toujours un facteur de 1."})

    def current_price(self):
        promo_ok = self.product.promo_until is None or self.product.promo_until >= timezone.localdate()
        if self.promo_price is not None and promo_ok:
            return self.promo_price
        if self.factor == 1 and self.unit_id == self.product.base_unit_id:
            return self.product.current_price()
        return self.price

    def to_base(self, quantity):
        return Decimal(quantity) * self.factor


class Promotion(BaseModel):
    class Kind(models.TextChoices):
        PERCENT = "percent", "Pourcentage"
        AMOUNT = "amount", "Montant fixe"

    code = models.CharField(max_length=30, unique=True)
    label = models.CharField(max_length=120)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PERCENT)
    value = money_field()
    min_amount = money_field()
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    max_uses = models.PositiveIntegerField(null=True, blank=True)
    used = models.PositiveIntegerField(default=0)
    agencies = models.ManyToManyField("agencies.Agency", blank=True, related_name="promotions")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "promotion"

    def __str__(self):
        return self.code

    def discount_for(self, amount):
        today = timezone.localdate()
        if not self.is_active or amount < self.min_amount:
            return Decimal(0)
        if (self.starts_on and today < self.starts_on) or (self.ends_on and today > self.ends_on):
            return Decimal(0)
        if self.max_uses is not None and self.used >= self.max_uses:
            return Decimal(0)
        if self.kind == self.Kind.PERCENT:
            return (Decimal(amount) * self.value / 100).quantize(Decimal("1"))
        return min(Decimal(amount), self.value)


class ShowcaseSlide(BaseModel):
    """Un « univers » de la vitrine 3D de l'accueil public (Eau, Papier, Boissons, Maison…)."""

    class Model(models.TextChoices):
        BOTTLE = "bottle", "Bouteille d'eau"
        BOX = "box", "Boîte de mouchoirs"
        CAN = "can", "Canette"
        PUMP = "pump", "Flacon pompe"
        PHOTO = "photo", "Ma photo détourée"

    word = models.CharField(max_length=14, help_text="Mot géant en arrière-plan et onglet (ex. Eau)")
    title = models.CharField(max_length=90, help_text="Titre principal")
    text = models.CharField(max_length=220, blank=True)
    color = models.CharField(max_length=9, default="#4B35E0", help_text="Couleur de fond de l'univers")
    model = models.CharField(max_length=10, choices=Model.choices, default=Model.BOTTLE)
    label_title = models.CharField(max_length=24, blank=True, help_text="Texte imprimé sur l'étiquette 3D")
    label_sub = models.CharField(max_length=24, blank=True, help_text="Sous-texte de l'étiquette (contenance…)")
    image = models.ImageField(upload_to="showcase/", blank=True, null=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
                                 help_text="Catégorie ouverte par « Voir ces produits »")
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    MAX_ACTIVE = 6

    class Meta:
        ordering = ["position", "id"]
        verbose_name = "univers de la vitrine"
        verbose_name_plural = "univers de la vitrine"

    def __str__(self):
        return self.word
