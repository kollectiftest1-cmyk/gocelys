"""
Finances (cahier des charges §19 à §25, règle 10).

`FinancialTransaction` est le registre unique des entrées/sorties d'argent, séparé
logiquement des données commerciales : une vente produit du chiffre d'affaires
(dans `sales`), son encaissement produit une transaction ici.
"""
from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, Currency, money_field


class PaymentMethod(BaseModel):
    class Kind(models.TextChoices):
        CASH = "cash", "Espèces"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        TRANSFER = "transfer", "Virement"
        CARD = "card", "Paiement électronique"
        OTHER = "other", "Autre"

    code = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=60)
    kind = models.CharField(max_length=14, choices=Kind.choices)
    requires_reference = models.BooleanField(default=False)
    available_pos = models.BooleanField(default=True)
    available_online = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]
        verbose_name = "moyen de paiement"

    def __str__(self):
        return self.name


class FinanceCategory(BaseModel):
    class Direction(models.TextChoices):
        IN = "in", "Entrée"
        OUT = "out", "Sortie"

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    direction = models.CharField(max_length=3, choices=Direction.choices)
    is_expense = models.BooleanField(default=False, help_text="Catégorie proposée pour les dépenses")
    color = models.CharField(max_length=9, blank=True)

    class Meta:
        ordering = ["direction", "name"]
        verbose_name = "catégorie financière"

    def __str__(self):
        return self.name


class FinancialTransaction(BaseModel):
    class Direction(models.TextChoices):
        IN = "in", "Entrée"
        OUT = "out", "Sortie"

    class Source(models.TextChoices):
        SALE = "sale", "Vente POS"
        SALE_REFUND = "sale_refund", "Remboursement vente"
        ORDER = "order", "Paiement commande"
        EXPENSE = "expense", "Dépense"
        DUE = "due", "Charge récurrente"
        CASH_IN = "cash_in", "Apport de caisse"
        CASH_OUT = "cash_out", "Retrait de caisse"
        MANUAL = "manual", "Saisie manuelle"

    reference = models.CharField(max_length=40, db_index=True)
    direction = models.CharField(max_length=3, choices=Direction.choices, db_index=True)
    source = models.CharField(max_length=12, choices=Source.choices, db_index=True)
    category = models.ForeignKey(FinanceCategory, null=True, blank=True, on_delete=models.PROTECT, related_name="transactions")
    amount = money_field(help_text="Toujours positif ; le sens est donné par direction")
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.CDF)
    amount_cdf = money_field(help_text="Contre-valeur CDF au taux du jour (pour la consolidation)")
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="transactions")
    method = models.ForeignKey(PaymentMethod, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    cash_session = models.ForeignKey("sales.CashSession", null=True, blank=True, on_delete=models.PROTECT, related_name="transactions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    label = models.CharField(max_length=200, blank=True)
    external_reference = models.CharField(max_length=80, blank=True, help_text="Réf. Mobile Money, virement…")
    source_id = models.CharField(max_length=64, blank=True)
    occurred_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        verbose_name = "transaction financière"

    def __str__(self):
        sign = "+" if self.direction == self.Direction.IN else "−"
        return f"{self.reference} {sign}{self.amount} {self.currency}"


class Expense(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        PENDING = "pending", "À valider"
        APPROVED = "approved", "Validée"
        PAID = "paid", "Payée"
        REJECTED = "rejected", "Refusée"

    reference = models.CharField(max_length=40, unique=True)
    category = models.ForeignKey(FinanceCategory, on_delete=models.PROTECT, related_name="expenses")
    amount = money_field()
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.CDF)
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="expenses")
    beneficiary = models.CharField(max_length=120, blank=True)
    reason = models.CharField(max_length=255)
    spent_on = models.DateField()
    method = models.ForeignKey(PaymentMethod, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    paid_from_cash = models.ForeignKey("sales.CashSession", null=True, blank=True, on_delete=models.PROTECT, related_name="expenses")
    receipt = models.FileField(upload_to="expenses/", blank=True, null=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True)
    transaction = models.OneToOneField(FinancialTransaction, null=True, blank=True, on_delete=models.SET_NULL, related_name="expense")

    class Meta:
        ordering = ["-spent_on", "-created_at"]
        verbose_name = "dépense"

    def __str__(self):
        return f"{self.reference} {self.category} {self.amount} {self.currency}"


class RecurringCharge(BaseModel):
    class Frequency(models.TextChoices):
        DAILY = "daily", "Quotidienne"
        WEEKLY = "weekly", "Hebdomadaire"
        MONTHLY = "monthly", "Mensuelle"
        QUARTERLY = "quarterly", "Trimestrielle"
        YEARLY = "yearly", "Annuelle"
        CUSTOM = "custom", "Personnalisée (tous les N jours)"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Suspendue"
        ENDED = "ended", "Terminée"

    name = models.CharField(max_length=120)
    category = models.ForeignKey(FinanceCategory, on_delete=models.PROTECT, related_name="charges")
    amount = money_field()
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.CDF)
    agency = models.ForeignKey("agencies.Agency", on_delete=models.PROTECT, related_name="charges")
    beneficiary = models.CharField(max_length=120, blank=True)
    frequency = models.CharField(max_length=10, choices=Frequency.choices, default=Frequency.MONTHLY)
    interval_days = models.PositiveIntegerField(default=30, help_text="Pour la fréquence personnalisée")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    due_day = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Jour du mois (mensuel, trimestriel, annuel)")
    remind_days_before = models.PositiveSmallIntegerField(default=5)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["name"]
        verbose_name = "charge récurrente"

    def __str__(self):
        return f"{self.name} — {self.agency.name}"


class Due(BaseModel):
    class Status(models.TextChoices):
        UPCOMING = "upcoming", "À venir"
        DUE_SOON = "due_soon", "Échéance proche"
        OVERDUE = "overdue", "En retard"
        PAID = "paid", "Payée"
        CANCELLED = "cancelled", "Annulée"

    charge = models.ForeignKey(RecurringCharge, on_delete=models.CASCADE, related_name="dues")
    due_date = models.DateField(db_index=True)
    amount = money_field()
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.CDF)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.UPCOMING, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    transaction = models.OneToOneField(FinancialTransaction, null=True, blank=True, on_delete=models.SET_NULL, related_name="due")
    reminded_at = models.DateTimeField(null=True, blank=True)
    overdue_notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("charge", "due_date")]
        ordering = ["due_date"]
        verbose_name = "échéance"

    def __str__(self):
        return f"{self.charge.name} — {self.due_date}"

    @property
    def agency(self):
        return self.charge.agency
