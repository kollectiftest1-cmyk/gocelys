"""
Initialisation de PRODUCTION (sans données de démonstration). Idempotent : relancé à chaque mise à jour.

    python manage.py bootstrap                        # référentiel seulement
    python manage.py bootstrap --admin admin --password-file /etc/gocelsys/admin.pw

Ce que fait la commande, sans jamais écraser ce que l'entreprise a modifié :
- rôles système : créés s'ils manquent ; les nouvelles permissions des versions suivantes y sont AJOUTÉES
  (celles retirées à la main par un administrateur ne sont pas remises, sauf pour « admin » qui a tout) ;
- paramètres, unités, moyens de paiement, catégories financières : créés s'ils manquent ;
- catégories de produits et univers de la vitrine : créés uniquement si la base n'en a aucun ;
- compte administrateur : créé uniquement s'il n'existe aucun superutilisateur.
"""
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.catalog import ALL, ROLE_PRESETS
from apps.accounts.models import Role, User
from apps.catalog.defaults import create_default_slides
from apps.catalog.models import Category, Promotion, ShowcaseSlide, Unit
from apps.core.models import Setting
from apps.finance.models import FinanceCategory, PaymentMethod

from .seed_demo import CATEGORIES, UNITS

PAYMENT_METHODS = [
    ("especes", "Espèces", "cash", False), ("mpesa", "M-Pesa", "mobile_money", True),
    ("orange-money", "Orange Money", "mobile_money", True), ("airtel-money", "Airtel Money", "mobile_money", True),
    ("virement", "Virement bancaire", "transfer", True), ("carte", "Carte bancaire", "card", True),
]
FINANCE_CATEGORIES = [
    ("ventes", "Ventes", "in", False, "#19B3D6"), ("apport-caisse", "Apport de caisse", "in", False, "#3EC6E0"),
    ("autres-recettes", "Autres recettes", "in", False, "#1F9D5C"),
    ("carburant", "Carburant", "out", True, "#F28C28"), ("maintenance", "Maintenance", "out", True, "#E3A21A"),
    ("salaires", "Salaires et primes", "out", True, "#7A5AF8"), ("loyer", "Loyer", "out", True, "#D64545"),
    ("electricite", "Électricité", "out", True, "#F2B33D"), ("internet", "Internet", "out", True, "#0E8FB8"),
    ("securite", "Sécurité", "out", True, "#0B3D5C"), ("nettoyage", "Nettoyage", "out", True, "#9BC53D"),
    ("fournitures", "Fournitures", "out", True, "#A3A9B3"), ("transport", "Transport", "out", True, "#C9A66B"),
    ("retrait-caisse", "Retrait de caisse", "out", False, "#6B7785"),
]


class Command(BaseCommand):
    help = "Initialise ou met à niveau le référentiel de production (sans données de démonstration)."

    def add_arguments(self, parser):
        parser.add_argument("--admin", help="Identifiant du compte administrateur à créer s'il n'y en a aucun.")
        parser.add_argument("--password-file", help="Fichier contenant le mot de passe de cet administrateur.")
        parser.add_argument("--email", default="", help="E-mail de l'administrateur.")

    @transaction.atomic
    def handle(self, *args, **opts):
        created = []
        # Rôles système : on complète, on ne retire jamais
        for code, preset in ROLE_PRESETS.items():
            role, new = Role.objects.get_or_create(
                code=code, defaults={"name": preset["name"], "scope": preset["scope"], "permissions": preset["permissions"], "is_system": True})
            if new:
                created.append(f"rôle {role.name}")
                continue
            wanted = ALL if code == "admin" else preset["permissions"]
            missing = [p for p in wanted if p not in (role.permissions or [])]
            if missing:
                role.permissions = [*(role.permissions or []), *missing]
                role.save(update_fields=["permissions"])
                created.append(f"{len(missing)} permission(s) ajoutée(s) au rôle {role.name}")

        Setting.objects.get_or_create(key="usd_rate", defaults={"value": 2850, "label": "Taux du jour (1 USD en CDF)"})

        for code, name in UNITS:
            _, new = Unit.objects.get_or_create(code=code, defaults={"name": name, "plural": name + "s"})
            if new:
                created.append(f"unité {name}")

        for i, (code, name, kind, ref) in enumerate(PAYMENT_METHODS):
            _, new = PaymentMethod.objects.get_or_create(code=code, defaults={
                "name": name, "kind": kind, "requires_reference": ref, "position": i,
                "available_pos": code != "virement", "available_online": code != "carte"})
            if new:
                created.append(f"moyen de paiement {name}")

        for code, name, direction, is_expense, color in FINANCE_CATEGORIES:
            _, new = FinanceCategory.objects.get_or_create(code=code, defaults={
                "name": name, "direction": direction, "is_expense": is_expense, "color": color})
            if new:
                created.append(f"catégorie financière {name}")

        if not Category.objects.exists():
            for i, (name, icon, color, desc, children) in enumerate(CATEGORIES):
                parent = Category.objects.create(name=name, icon=icon, color=color, description=desc, position=i)
                for j, child in enumerate(children):
                    Category.objects.create(name=child, parent=parent, color=color, position=j)
            created.append("catégories de produits par défaut")

        if not ShowcaseSlide.objects.exists():
            create_default_slides(ShowcaseSlide, Category)
            created.append("univers de la vitrine")
        # univers créés par la migration avant les catégories : on les relie à leur catégorie
        from apps.catalog.defaults import DEFAULT_SLIDES

        for d in DEFAULT_SLIDES:
            cat = Category.objects.filter(name=d["category"], parent=None).first()
            if cat and ShowcaseSlide.objects.filter(word=d["word"], category__isnull=True).update(category=cat):
                created.append(f"univers « {d['word']} » relié à {cat.name}")

        Promotion.objects.get_or_create(code="BIENVENUE", defaults={
            "label": "−10 % sur la première commande", "kind": "percent", "value": 10, "min_amount": 10000})

        if opts.get("admin") and not User.objects.filter(is_superuser=True).exists():
            password = Path(opts["password_file"]).read_text().strip() if opts.get("password_file") else None
            if not password:
                self.stderr.write("Mot de passe administrateur manquant (--password-file).")
            else:
                user = User.objects.create_superuser(username=opts["admin"], email=opts["email"], password=password,
                                                     first_name="Administrateur")
                from apps.accounts.models import UserRole

                UserRole.objects.get_or_create(user=user, role=Role.objects.get(code="admin"), agency=None)
                created.append(f"compte administrateur « {user.username} »")

        if created:
            for line in created:
                self.stdout.write(f"  + {line}")
        self.stdout.write(self.style.SUCCESS("Référentiel de production à jour."))
