"""
Données de démonstration Gocelsys : agences, produits, utilisateurs par rôle et 30 jours d'activité.

    python manage.py seed_demo            # crée si la base est vide
    python manage.py seed_demo --reset    # vide les données métier puis recrée

Tous les mouvements passent par les services métier : stocks, caisses et finances restent cohérents.
"""
import random
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.catalog import ROLE_PRESETS
from apps.accounts.models import Role, User, UserRole
from apps.agencies.models import Agency, DeliveryZone, PointOfSale
from apps.catalog.models import Category, Product, ProductUnit, Promotion, Unit
from apps.core.models import Setting
from apps.delivery import services as delivery_services
from apps.delivery.models import Driver
from apps.finance import services as finance
from apps.finance.models import FinanceCategory, PaymentMethod, RecurringCharge
from apps.inventory import services as stock
from apps.inventory.models import Bucket, MovementKind
from apps.orders import services as order_services
from apps.orders.models import Address, Customer, Order
from apps.sales import services as sales
from apps.sales.models import CashSession

D = Decimal
PASSWORD = "gocelsys2026"

AGENCIES = [
    # code, nom, ville, adresse, lat, lng, couleur, production
    ("DEP", "Dépôt central Matadi", "Matadi", "Route de Kinshasa, Soyo", -5.8250, 13.4900, "#0E5C8A", True),
    ("MAT", "Matadi Centre", "Matadi", "Av. Kinkanda 12, Commune de Matadi", -5.8165, 13.4580, "#19B3D6", False),
    ("BOM", "Boma Marché", "Boma", "Bd. du 30 Juin, face au grand marché", -5.8540, 13.0560, "#F28C28", False),
    ("MBG", "Mbanza-Ngungu", "Mbanza-Ngungu", "Av. de la Gare 4", -5.2500, 14.8640, "#5B8C2A", False),
    ("MUA", "Muanda Plage", "Muanda", "Av. de l'Océan 21", -5.9340, 12.3500, "#7A5AF8", False),
    ("KIN", "Kinshasa Gombe", "Kinshasa", "Bd. du 30 Juin 980, Gombe", -4.3060, 15.3110, "#C2569B", False),
]

UNITS = [("piece", "Pièce"), ("sachet", "Sachet"), ("bouteille", "Bouteille"), ("bidon", "Bidon"), ("canette", "Canette"),
         ("boite", "Boîte"), ("rouleau", "Rouleau"), ("paquet", "Paquet"), ("flacon", "Flacon"), ("pack", "Pack"),
         ("carton", "Carton"), ("caisse", "Caisse"), ("sac", "Sac"), ("litre", "Litre"), ("kg", "Kilogramme")]

# Catégories principales et sous-catégories : (nom, icône, couleur, description, [sous-catégories])
CATEGORIES = [
    ("Eau et boissons", "droplet", "#22C3E6", "Eau minérale, eau pure, jus et sodas.", ["Eau", "Jus et sodas"]),
    ("Hygiène et papier", "sparkles", "#6450FF", "Mouchoirs, papier toilette, savons.", ["Papier", "Soins et savons"]),
    ("Alimentation", "wheat", "#F2A01F", "Riz, sucre, huile, farine.", ["Épicerie"]),
    ("Entretien de la maison", "spray-can", "#16B36A", "Lessive, javel, produits ménagers.", ["Ménage"]),
]

DESCRIPTIONS = {
    "EB-150": "Eau minérale naturelle, faiblement minéralisée. Le format familial du quotidien.",
    "EB-190": "Bonbonne pour fontaine, idéale pour bureaux, écoles et restaurants. Consigne reprise en agence.",
    "PM-BOX": "Mouchoirs doux trois plis, boîte distributrice de 100 feuilles.",
    "PH-ROU": "Papier toilette double épaisseur, rouleau de 200 feuilles.",
    "BS-JUS": "Jus de fruits tropicaux, servi bien frais.",
    "SV-LIQ": "Savon liquide doux pour les mains, flacon pompe.",
    "AL-RIZ": "Riz long parfumé, sac de 25 kg.",
}

# code, nom, sous-catégorie, unité de base, prix, min, max, [conditionnements (unité, facteur, prix)], couleur, visuel, vedette
PRODUCTS = [
    ("EB-150", "Eau minérale 1,5 L", "Eau", "bouteille", 1500, 240, 2400, [("pack", 6, 8500), ("carton", 12, 16500)], "#22C3E6", "bottle", True),
    ("EB-050", "Eau minérale 0,5 L", "Eau", "bouteille", 700, 240, 2400, [("pack", 12, 7800), ("carton", 24, 15000)], "#5AD2EE", "bottle", False),
    ("EP-SAC", "Eau pure sachet 500 ml", "Eau", "sachet", 200, 600, 6000, [("paquet", 30, 5500)], "#8BE1F2", "sachet", False),
    ("EB-190", "Eau fontaine 19 L", "Eau", "bidon", 9000, 30, 300, [], "#0B9CC4", "jug", True),
    ("EB-500", "Eau minérale bidon 5 L", "Eau", "bidon", 3500, 60, 600, [("pack", 4, 13500)], "#1FA9D0", "jug", False),
    ("PM-BOX", "Papier mouchoir — boîte de 100", "Papier", "boite", 1800, 120, 1200, [("carton", 24, 40000)], "#6450FF", "box", True),
    ("PH-ROU", "Papier hygiénique double épaisseur", "Papier", "rouleau", 1000, 240, 2400, [("paquet", 12, 11000)], "#A99DFF", "roll", True),
    ("BS-JUS", "Jus tropical 33 cl", "Jus et sodas", "canette", 1200, 120, 1200, [("pack", 6, 6900), ("carton", 24, 26500)], "#F2A01F", "can", True),
    ("BS-SOD", "Soda orange 33 cl", "Jus et sodas", "canette", 1000, 120, 1200, [("carton", 24, 22000)], "#F25A3C", "can", False),
    ("PM-POC", "Mouchoirs de poche — paquet de 10", "Papier", "paquet", 1500, 100, 1000, [("carton", 30, 42000)], "#8F80FF", "pack", False),
    ("SV-PAP", "Serviettes en papier x100", "Papier", "paquet", 2500, 60, 600, [], "#C9C2FF", "pack", False),
    ("SV-LIQ", "Savon liquide mains 500 ml", "Soins et savons", "flacon", 4500, 40, 400, [("carton", 12, 51000)], "#16B36A", "jar", True),
    ("CC-SAV", "Savon de ménage 400 g", "Soins et savons", "piece", 1500, 60, 600, [("carton", 36, 49000)], "#7BC67E", "bar", False),
    ("EN-LES", "Lessive en poudre 1 kg", "Ménage", "sac", 5500, 40, 400, [("carton", 10, 52000)], "#0E8A4F", "sack", False),
    ("EN-JAV", "Eau de Javel 1 L", "Ménage", "bouteille", 2500, 40, 400, [("carton", 12, 28000)], "#3B3B55", "bottle", False),
    ("AL-RIZ", "Riz parfumé 25 kg", "Épicerie", "sac", 72000, 10, 120, [], "#E3C089", "sack", True),
    ("AL-SUC", "Sucre en poudre 1 kg", "Épicerie", "paquet", 3200, 40, 400, [("carton", 20, 61000)], "#F0D9A8", "pack", False),
    ("AL-HUI", "Huile végétale 1 L", "Épicerie", "bouteille", 5200, 40, 400, [("carton", 12, 60000)], "#E8B90E", "bottle", False),
    ("AL-FAR", "Farine de maïs 5 kg", "Épicerie", "sac", 9500, 20, 200, [], "#D8C38E", "sack", False),
]

PEOPLE = [
    # username, prénom, nom, téléphone, rôle, agence (code ou None)
    ("admin", "Jordache", "Nzita", "+243810000001", "admin", None),
    ("direction", "Grâce", "Mavungu", "+243810000002", "direction", None),
    ("resp.matadi", "Patrick", "Lumbu", "+243810000010", "agency_manager", "MAT"),
    ("resp.boma", "Clarisse", "Nsimba", "+243810000011", "agency_manager", "BOM"),
    ("resp.depot", "Héritier", "Makiese", "+243810000012", "agency_manager", "DEP"),
    ("caisse.matadi", "Divine", "Kiese", "+243810000020", "cashier", "MAT"),
    ("caisse.boma", "Benjamin", "Luzolo", "+243810000021", "cashier", "BOM"),
    ("caisse.kin", "Merveille", "Tshibangu", "+243810000022", "cashier", "KIN"),
    ("caisse.mbg", "Gloire", "Nzuzi", "+243810000023", "cashier", "MBG"),
    ("stock.depot", "Fiston", "Nkanga", "+243810000030", "stock_keeper", "DEP"),
    ("stock.matadi", "Rachel", "Mbuyi", "+243810000031", "stock_keeper", "MAT"),
    ("livreur.matadi", "Christian", "Ndombe", "+243810000040", "driver", "MAT"),
    ("livreur.matadi2", "Josué", "Mfumu", "+243810000041", "driver", "MAT"),
    ("livreur.boma", "Exaucé", "Kalunga", "+243810000042", "driver", "BOM"),
    ("livreur.kin", "Trésor", "Ilunga", "+243810000043", "driver", "KIN"),
    ("livreur.mbg", "Dieumerci", "Nlandu", "+243810000044", "driver", "MBG"),
]

CUSTOMERS = [
    ("Mme Lusamba Nkembo", "+243820000101"), ("Restaurant Le Fleuve", "+243820000102"),
    ("Papa Ndonzwau", "+243820000103"), ("Hôtel Ledya", "+243820000104"), ("Sœur Bernadette Mpia", "+243820000105"),
    ("Boutique Ya Mado", "+243820000106"), ("Kevin Lukoki", "+243820000107"), ("Clinique Sainte-Anne", "+243820000108"),
    ("Arlette Tamba", "+243820000109"), ("École Bondeko", "+243820000110"), ("Rodrigue Mansoni", "+243820000111"),
    ("Snack Mama Kiese", "+243820000112"),
]

ZONES = {
    "MAT": [("Centre-ville", 1500, 30), ("Mvuzi", 2000, 40), ("Nzanza", 2500, 45), ("Soyo", 3000, 60)],
    "BOM": [("Kalamu", 1500, 30), ("Nzadi", 2000, 40), ("Kabondo", 2500, 50)],
    "KIN": [("Gombe", 2500, 35), ("Lingwala", 3000, 45), ("Barumbu", 3000, 45)],
    "MBG": [("Centre", 1500, 30)],
    "MUA": [("Centre", 1500, 30), ("Plage", 2000, 35)],
}


class Command(BaseCommand):
    help = "Crée des données de démonstration réalistes pour Gocelsys."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Supprime les données existantes avant de semer.")
        parser.add_argument("--days", type=int, default=30)

    def handle(self, *args, **opts):
        random.seed(2026)
        if opts["reset"]:
            self._reset()
        if Agency.objects.exists():
            self.stdout.write(self.style.WARNING("Des données existent déjà. Utilisez --reset pour recommencer."))
            return
        with transaction.atomic():
            self._reference()
            self._people()
        self._history(opts["days"])
        self.stdout.write(self.style.SUCCESS(
            f"Données de démonstration prêtes. Mot de passe de tous les comptes : {PASSWORD}\n"
            "  admin · direction · resp.matadi · caisse.matadi · stock.depot · livreur.matadi · client 0820000101"))

    # ------------------------------------------------------------------ reset
    def _reset(self):
        from django.apps import apps
        from django.db import connection

        self.stdout.write("Suppression des données…")
        labels = ["notifications", "delivery", "sales", "orders", "finance", "inventory", "catalog", "agencies", "accounts", "core"]
        with connection.cursor() as cursor:
            if connection.vendor == "sqlite":
                cursor.execute("PRAGMA foreign_keys = OFF")
            for label in labels:
                for model in apps.get_app_config(label).get_models():
                    cursor.execute(f'DELETE FROM "{model._meta.db_table}"')
            if connection.vendor == "sqlite":
                cursor.execute("PRAGMA foreign_keys = ON")

    # ------------------------------------------------------------------ référentiel
    def _reference(self):
        for key, label in [("usd_rate", "Taux du jour (1 USD en CDF)")]:
            Setting.objects.update_or_create(key=key, defaults={"value": 2850, "label": label})
        for code, preset in ROLE_PRESETS.items():
            Role.objects.update_or_create(code=code, defaults={"name": preset["name"], "scope": preset["scope"],
                                                               "permissions": preset["permissions"], "is_system": True})
        self.agencies = {}
        for code, name, city, address, lat, lng, color, prod in AGENCIES:
            hours = {d: "07:00-19:00" for d in ["lun", "mar", "mer", "jeu", "ven", "sam"]}
            hours["dim"] = "08:00-13:00"
            a = Agency.objects.create(code=code, name=name, city=city, address=address, latitude=lat, longitude=lng,
                                      color=color, is_production_site=prod, accepts_online_orders=not prod,
                                      phone=f"+2438100{random.randint(10000, 99999)}", opening_hours=hours)
            self.agencies[code] = a
            n_pos = 1 if prod else 2
            for i in range(1, n_pos + 1):
                PointOfSale.objects.create(agency=a, code=f"POS{i}", name=f"Caisse {i}", default_float=50000)
            for zname, fee, minutes in ZONES.get(code, []):
                DeliveryZone.objects.create(agency=a, name=zname, fee=fee, estimated_minutes=minutes)
        Agency.objects.filter(code="MUA").update(status=Agency.Status.CLOSED_TEMP)

        self.units = {c: Unit.objects.create(code=c, name=n, plural=n + "s") for c, n in UNITS}
        self.categories = {}
        for i, (name, icon, color, desc, children) in enumerate(CATEGORIES):
            parent = Category.objects.create(name=name, icon=icon, color=color, description=desc, position=i)
            self.categories[name] = parent
            for j, child in enumerate(children):
                self.categories[child] = Category.objects.create(name=child, parent=parent, color=color, position=j)
        self.products = []
        for code, name, cat, unit, price, mn, mx, packs, color, visual, featured in PRODUCTS:
            p = Product.objects.create(code=code, reference=f"REF-{code}", name=name, category=self.categories[cat],
                                       base_unit=self.units[unit], price=price, min_stock=mn, max_stock=mx,
                                       barcode=f"6{random.randint(10**11, 10**12 - 1)}", accent=color, visual=visual,
                                       is_featured=featured, description=DESCRIPTIONS.get(code, f"{name}, distribué par Gocelsys."))
            ProductUnit.objects.create(product=p, unit=self.units[unit], factor=1, price=price, barcode=p.barcode, is_default=True)
            for u, factor, pprice in packs:
                ProductUnit.objects.create(product=p, unit=self.units[u], factor=factor, price=pprice,
                                           barcode=f"7{random.randint(10**11, 10**12 - 1)}")
            self.products.append(p)
        Product.objects.filter(code="BS-JUS").update(promo_price=1000, promo_until=timezone.localdate() + timedelta(days=20))
        from apps.catalog.defaults import create_default_slides
        from apps.catalog.models import ShowcaseSlide

        create_default_slides(ShowcaseSlide, Category)

        methods = [("especes", "Espèces", "cash", False), ("mpesa", "M-Pesa", "mobile_money", True),
                   ("orange-money", "Orange Money", "mobile_money", True), ("airtel-money", "Airtel Money", "mobile_money", True),
                   ("virement", "Virement bancaire", "transfer", True), ("carte", "Carte bancaire", "card", True)]
        self.methods = {}
        for i, (code, name, kind, ref) in enumerate(methods):
            self.methods[code] = PaymentMethod.objects.create(code=code, name=name, kind=kind, requires_reference=ref, position=i,
                                                              available_pos=code != "virement", available_online=code != "carte")
        cats = [("ventes", "Ventes", "in", False, "#19B3D6"), ("apport-caisse", "Apport de caisse", "in", False, "#3EC6E0"),
                ("autres-recettes", "Autres recettes", "in", False, "#1F9D5C"),
                ("carburant", "Carburant", "out", True, "#F28C28"), ("maintenance", "Maintenance", "out", True, "#E3A21A"),
                ("salaires", "Salaires et primes", "out", True, "#7A5AF8"), ("loyer", "Loyer", "out", True, "#D64545"),
                ("electricite", "Électricité", "out", True, "#F2B33D"), ("internet", "Internet", "out", True, "#0E8FB8"),
                ("securite", "Sécurité", "out", True, "#0B3D5C"), ("nettoyage", "Nettoyage", "out", True, "#9BC53D"),
                ("fournitures", "Fournitures", "out", True, "#A3A9B3"), ("transport", "Transport", "out", True, "#C9A66B"),
                ("retrait-caisse", "Retrait de caisse", "out", False, "#6B7785")]
        for code, name, direction, is_expense, color in cats:
            FinanceCategory.objects.create(code=code, name=name, direction=direction, is_expense=is_expense, color=color)
        Promotion.objects.create(code="BIENVENUE", label="−10 % sur la première commande", kind="percent", value=10, min_amount=10000)
        Promotion.objects.create(code="FONTAINE", label="−2 000 CDF dès 3 fontaines", kind="amount", value=2000, min_amount=27000)

    def _people(self):
        roles = {r.code: r for r in Role.objects.all()}
        self.users = {}
        for username, first, last, phone, role, agency in PEOPLE:
            u = User.objects.create_user(username=username, password=PASSWORD, first_name=first, last_name=last, phone=phone,
                                         email=f"{username}@gocelsys.cd", is_staff=role == "admin", is_superuser=role == "admin",
                                         default_agency=self.agencies.get(agency) if agency else None)
            from django.contrib.auth.hashers import make_password

            u.pin = make_password("1234")
            u.save(update_fields=["pin"])
            UserRole.objects.create(user=u, role=roles[role], agency=self.agencies.get(agency) if agency else None)
            if role == "driver":
                Driver.objects.create(user=u, agency=self.agencies[agency], vehicle=random.choice(["moto", "moto", "tricycle"]),
                                      plate=f"KC-{random.randint(1000, 9999)}-{random.choice('ABCD')}")
            self.users[username] = u
        # Chaque caissier travaille sur une caisse précise de son agence.
        for username, code, pos_code in [("caisse.matadi", "MAT", "POS1"), ("caisse.boma", "BOM", "POS1"),
                                         ("caisse.kin", "KIN", "POS1"), ("caisse.mbg", "MBG", "POS1")]:
            u = self.users[username]
            u.assigned_pos = PointOfSale.objects.get(agency=self.agencies[code], code=pos_code)
            u.save(update_fields=["assigned_pos"])
        Agency.objects.filter(code="MAT").update(manager=self.users["resp.matadi"])
        Agency.objects.filter(code="BOM").update(manager=self.users["resp.boma"])
        Agency.objects.filter(code="DEP").update(manager=self.users["resp.depot"])
        self.customers = []
        for i, (name, phone) in enumerate(CUSTOMERS):
            user = None
            if i < 4:
                user = User.objects.create_user(username=phone, password=PASSWORD, phone=phone, first_name=name.split(" ")[0],
                                                last_name=" ".join(name.split(" ")[1:]), kind=User.Kind.CUSTOMER)
            c = Customer.objects.create(user=user, name=name, phone=phone, preferred_agency=self.agencies["MAT" if i % 3 else "BOM"])
            agency = c.preferred_agency
            zones = list(agency.zones.all())
            Address.objects.create(customer=c, label="Domicile" if i % 2 else "Bureau", is_default=True,
                                   line=f"Av. {random.choice(['Lumumba', 'Kasa-Vubu', 'Mobutu', 'du Port', 'des Palmiers', 'Kinkanda'])} {random.randint(1, 120)}",
                                   landmark=random.choice(["en face de l'église", "près du marché", "à côté de la pharmacie", "derrière la station"]),
                                   city=agency.city, zone=random.choice(zones) if zones else None,
                                   latitude=float(agency.latitude) + random.uniform(-0.02, 0.02),
                                   longitude=float(agency.longitude) + random.uniform(-0.02, 0.02))
            self.customers.append(c)

    # ------------------------------------------------------------------ historique
    def _at(self, day, hour, minute=None):
        return timezone.make_aware(datetime.combine(day, time(hour, minute if minute is not None else random.randint(0, 59))))

    def _history(self, days):
        today = timezone.localdate()
        start = today - timedelta(days=days)
        admin = self.users["admin"]
        depot = self.agencies["DEP"]
        shops = [self.agencies[c] for c in ("MAT", "BOM", "MBG", "KIN")]
        self.stdout.write("Stock initial et production…")
        with transaction.atomic():
            for p in self.products:
                stock.record(agency=depot, product=p, bucket=Bucket.AVAILABLE, delta=p.max_stock * 2,
                             kind=MovementKind.INITIAL, reference="INIT-DEP", user=admin, reason="Stock d'ouverture",
                             occurred_at=self._at(start, 7))
                for a in shops + [self.agencies["MUA"]]:
                    stock.record(agency=a, product=p, bucket=Bucket.AVAILABLE, delta=(p.max_stock * D("0.6")).quantize(D("1")),
                                 kind=MovementKind.INITIAL, reference=f"INIT-{a.code}", user=admin, reason="Stock d'ouverture",
                                 occurred_at=self._at(start, 7))

        cashiers = {"MAT": self.users["caisse.matadi"], "BOM": self.users["caisse.boma"], "KIN": self.users["caisse.kin"],
                    "MBG": self.users["caisse.mbg"]}
        weights = {"EB-150": 22, "EB-050": 18, "EP-SAC": 30, "EB-190": 6, "EB-500": 10, "PM-BOX": 14, "PH-ROU": 16, "BS-JUS": 9,
                   "BS-SOD": 9, "PM-POC": 8, "SV-PAP": 3, "SV-LIQ": 4, "CC-SAV": 6, "EN-LES": 4, "EN-JAV": 3, "AL-RIZ": 1,
                   "AL-SUC": 4, "AL-HUI": 3, "AL-FAR": 2}
        products = self.products
        pweights = [weights[p.code] for p in products]
        cash, mpesa, orange, airtel = (self.methods[c] for c in ("especes", "mpesa", "orange-money", "airtel-money"))

        self.stdout.write(f"Ventes POS sur {days} jours…")
        for offset in range(days + 1):
            day = start + timedelta(days=offset)
            is_today = day == today
            for code, cashier in cashiers.items():
                agency = self.agencies[code]
                pos = agency.points_of_sale.first()
                with transaction.atomic():
                    session = sales.open_session(pos=pos, user=cashier, opening_float=50000, opened_at=self._at(day, 7, 30))
                    n_sales = random.randint(14, 30) if code in ("MAT", "KIN") else random.randint(8, 18)
                    if is_today:
                        n_sales = max(4, int(n_sales * min(1, (timezone.localtime().hour - 7) / 11 if timezone.localtime().hour > 8 else 0.3)))
                    for _ in range(n_sales):
                        basket = []
                        for p in random.choices(products, weights=pweights, k=random.randint(1, 4)):
                            units = list(p.units.all())
                            pu = random.choice(units) if len(units) > 1 and random.random() < 0.35 else units[0]
                            basket.append({"product_unit": pu.pk, "quantity": random.randint(1, 3 if pu.factor > 1 else 6)})
                        total = sum(ProductUnit.objects.get(pk=b["product_unit"]).current_price() * b["quantity"] for b in basket)
                        method = random.choices([cash, mpesa, orange, airtel], weights=[60, 20, 12, 8])[0]
                        paid = total
                        if method == cash:
                            paid = ((total // 1000) + (1 if total % 1000 else 0)) * 1000
                        hour = random.randint(8, 18) if not is_today else random.randint(8, max(8, min(18, timezone.localtime().hour)))
                        try:
                            sales.create_sale(user=cashier, session=session, lines=basket, client_uuid=uuid.uuid4(),
                                              payments=[{"method": method.pk, "amount": paid,
                                                         "reference": f"TX{random.randint(10**7, 10**8)}" if method != cash else ""}],
                                              occurred_at=self._at(day, hour), customer=random.choice(self.customers) if random.random() < 0.15 else None)
                        except Exception:
                            continue
                    if not is_today:
                        figures = sales.session_figures(session)
                        gap = random.choice([0, 0, 0, 0, 0, -2000, -5000, 1000, -15000])
                        session = sales.close_session(session, user=cashier, counted_cash=figures["expected_cash"] + gap,
                                            justification="" if gap == 0 else random.choice(["Erreur de rendu monnaie", "Billet abîmé refusé", "Écart non expliqué"]),
                                            closed_at=self._at(day, 19, 10))
                        if offset < days - 2:
                            sales.validate_session(session, self.users["resp.matadi"] if code != "BOM" else self.users["resp.boma"])
            # Production quotidienne au dépôt et réassort hebdomadaire
            with transaction.atomic():
                for p in products:
                    stock.record(agency=depot, product=p, bucket=Bucket.AVAILABLE, delta=(p.max_stock * D("0.13")).quantize(D("1")),
                                 kind=MovementKind.PRODUCTION, reference=f"PRD-{day:%y%m%d}", user=self.users["stock.depot"],
                                 reason="Production du jour", occurred_at=self._at(day, 6))
            if offset % 7 == 3 and offset < days - 1:
                for a in shops:
                    lines = [{"product": p, "quantity": (p.max_stock * D("0.28")).quantize(D("1"))} for p in products]
                    when = self._at(day, 8)
                    t = stock.create_transfer(source=depot, destination=a, lines=lines, user=self.users["resp.depot"],
                                              reason="Réassort hebdomadaire", at=when)
                    type(t).objects.filter(pk=t.pk).update(created_at=when)
                    stock.validate_transfer(t, self.users["resp.depot"], at=when + timedelta(minutes=20))
                    stock.ship_transfer(t, self.users["stock.depot"], at=when + timedelta(hours=1))
                    receiver = self.users["stock.matadi"] if a.code == "MAT" else self.users["admin"]
                    damaged = {products[1].pk: 2} if random.random() < 0.3 else {}
                    stock.receive_transfer(t, receiver, damaged=damaged, at=when + timedelta(hours=random.randint(4, 9)))

        self.stdout.write("Commandes et livraisons…")
        self._orders(start, today)
        self.stdout.write("Transferts en cours, inventaire, pertes…")
        self._ongoing(today)
        self.stdout.write("Dépenses et charges récurrentes…")
        self._finance(start, today)
        import logging

        from apps.notifications.services import run_alerts

        logging.getLogger("gocelsys").setLevel(logging.WARNING)
        run_alerts()
        # Historique : seules les alertes les plus récentes restent non lues.
        from apps.notifications.models import Notification

        for user in User.objects.all():
            keep = list(Notification.objects.filter(user=user).order_by("-created_at").values_list("pk", flat=True)[:9])
            Notification.objects.filter(user=user).exclude(pk__in=keep).update(read_at=timezone.now())

    def _orders(self, start, today):
        drivers = {d.agency.code: list(Driver.objects.filter(agency=d.agency)) for d in Driver.objects.select_related("agency")}
        manager = {"MAT": self.users["resp.matadi"], "BOM": self.users["resp.boma"]}
        for offset in range((today - start).days + 1):
            day = start + timedelta(days=offset)
            for _ in range(random.randint(3, 7)):
                customer = random.choice(self.customers)
                agency = customer.preferred_agency
                address = customer.addresses.first()
                pickup = random.random() < 0.25
                lines = []
                for p in random.choices([x for x in self.products if x.units.count() > 1], k=random.randint(1, 3)):
                    units = list(p.units.all())
                    pu = units[-1]
                    lines.append({"product_unit": pu.pk, "quantity": random.randint(1, 3)})
                method = random.choice([self.methods["especes"], self.methods["especes"], self.methods["mpesa"], self.methods["orange-money"]])
                try:
                    order = order_services.place_order(
                        customer=customer, lines=lines, fulfillment="pickup" if pickup else "delivery", user=customer.user,
                        requested_agency=agency, address=None if pickup else address, payment_method=method,
                        is_urgent=random.random() < 0.08, client_uuid=uuid.uuid4(), at=self._at(day, 12))
                except Exception:
                    continue
                created = self._at(day, random.randint(8, 17))
                Order.objects.filter(pk=order.pk).update(created_at=created, confirmed_at=created)
                order.history.update(at=created)
                order.refresh_from_db()
                if method.kind == "mobile_money" and random.random() < 0.8:
                    order_services.mark_paid(order, customer.user, method, f"MM{random.randint(10**7, 10**8)}")
                user = manager.get(order.agency.code, self.users["admin"])
                age = (today - day).days
                steps = ["accepted", "preparing", "ready"]
                if age == 0:
                    steps = steps[: random.randint(0, 3)]
                elif random.random() < 0.06:
                    order_services.transition(order, "refused" if random.random() < 0.5 else "cancelled", user=user, note="Client injoignable")
                    continue
                for s in steps:
                    order = order_services.transition(order, s, user=user)
                if order.status != "ready":
                    continue
                if pickup:
                    if age > 0 or random.random() < 0.3:
                        order_services.complete_pickup(order, user, order.pickup_code)
                    continue
                pool = drivers.get(order.agency.code) or []
                if not pool:
                    continue
                driver = random.choice(pool)
                delivery = delivery_services.assign(order, driver, user)
                if age == 0 and random.random() < 0.6:
                    if random.random() < 0.5:
                        delivery_services.driver_update(delivery, driver.user, "accepted")
                    continue
                delivery_services.driver_update(delivery, driver.user, "accepted")
                delivery_services.driver_update(delivery, driver.user, "picked_up")
                delivery = delivery_services.confirm(delivery, driver.user, method=random.choice(["otp", "otp", "driver"]),
                                                     otp=delivery.otp_code, note="Remis en main propre")
                done = created + timedelta(minutes=random.randint(25, 80))
                order.refresh_from_db()
                Order.objects.filter(pk=order.pk).update(delivered_at=done)
                type(delivery).objects.filter(pk=delivery.pk).update(assigned_at=created + timedelta(minutes=20), arrived_at=done)

    def _ongoing(self, today):
        depot, mat, bom, kin = (self.agencies[c] for c in ("DEP", "MAT", "BOM", "KIN"))
        p = {x.code: x for x in self.products}
        t1 = stock.create_transfer(source=depot, destination=kin, user=self.users["resp.depot"], reason="Réassort Kinshasa",
                                   lines=[{"product": p["EB-150"], "quantity": 480}, {"product": p["EB-500"], "quantity": 120}])
        stock.validate_transfer(t1, self.users["resp.depot"])
        stock.ship_transfer(t1, self.users["stock.depot"])
        t2 = stock.create_transfer(source=mat, destination=bom, user=self.users["resp.matadi"], reason="Dépannage mouchoirs Boma",
                                   lines=[{"product": p["PM-BOX"], "quantity": 48}])
        stock.create_transfer(source=depot, destination=mat, user=self.users["stock.matadi"], reason="Fontaines pour les bureaux",
                              lines=[{"product": p["EB-190"], "quantity": 60}])
        stock.validate_transfer(t2, self.users["resp.matadi"])
        # Rupture et stock faible visibles
        stock.adjust(agency=bom, product=p["EB-190"], new_quantity=0, user=self.users["resp.boma"], reason="Comptage : fontaines épuisées")
        stock.adjust(agency=kin, product=p["EP-SAC"], new_quantity=180, user=self.users["admin"], reason="Correction après comptage")
        stock.declare_loss(agency=mat, product=p["EB-050"], quantity=12, user=self.users["stock.matadi"], reason="Pack percé au déchargement", damaged=True)
        stock.declare_loss(agency=bom, product=p["PM-BOX"], quantity=8, user=self.users["resp.boma"], reason="Carton mouillé pendant la pluie")
        inv = stock.start_inventory(agency=mat, user=self.users["stock.matadi"], products=list(self.products[:6]), note="Inventaire eau et papier — fin de mois")
        for line in inv.lines.all():
            line.counted = line.expected - random.choice([0, 0, 0, 2, 5, 10])
            line.save()
        stock.submit_inventory(inv, self.users["stock.matadi"])
        stock.start_inventory(agency=bom, user=self.users["resp.boma"], products=list(self.products[7:12]), note="Boissons et papier")
        # Tournée du jour pour le livreur de démonstration
        driver = Driver.objects.get(user=self.users["livreur.matadi"])
        for i, customer in enumerate([c for c in self.customers if c.preferred_agency_id == mat.pk][:3]):
            order = order_services.place_order(
                customer=customer, lines=[{"product_unit": p["EB-150"].units.get(factor=6).pk, "quantity": 2 + i},
                                          {"product_unit": p["PM-BOX"].units.get(factor=1).pk, "quantity": 3 + i}],
                fulfillment="delivery", requested_agency=mat, address=customer.addresses.first(),
                payment_method=self.methods["especes"] if i else self.methods["mpesa"], client_uuid=uuid.uuid4(),
                note="Appeler en arrivant" if i == 1 else "")
            for st in ("accepted", "preparing", "ready"):
                order = order_services.transition(order, st, user=self.users["resp.matadi"])
            d = delivery_services.assign(order, driver, self.users["resp.matadi"])
            if i == 0:
                delivery_services.driver_update(d, driver.user, "accepted")

    def _finance(self, start, today):
        cat = {c.code: c for c in FinanceCategory.objects.all()}
        mat, bom, depot, kin = (self.agencies[c] for c in ("MAT", "BOM", "DEP", "KIN"))
        managers = [self.users["resp.matadi"], self.users["resp.boma"], self.users["admin"]]
        for offset in range(0, (today - start).days + 1, 2):
            day = start + timedelta(days=offset)
            for agency, user in ((mat, managers[0]), (bom, managers[1]), (depot, managers[2])):
                kind = random.choice(["carburant", "carburant", "maintenance", "fournitures", "transport"])
                amount = {"carburant": random.choice([45000, 50000, 60000]), "maintenance": random.choice([35000, 80000, 250000]),
                          "fournitures": random.choice([15000, 22000]), "transport": random.choice([20000, 30000])}[kind]
                e = finance.create_expense(user=user, data={
                    "category": cat[kind], "amount": amount, "currency": "CDF", "agency": agency,
                    "beneficiary": random.choice(["Station Engen", "Garage Ya Paulin", "Papeterie du Port", "Transport Kongo"]),
                    "reason": {"carburant": "Carburant — livraison", "maintenance": "Entretien moto livreur", "fournitures": "Rouleaux tickets POS",
                               "transport": "Transport marchandises"}[kind], "spent_on": day, "method": self.methods["especes"]})
                if e.status == "approved" and (today - day).days > 1:
                    finance.pay_expense(e, user)
        charges = [
            ("Loyer Agence Matadi", "loyer", 300, "USD", mat, "M. Nlandu (bailleur)", "monthly", 30),
            ("Loyer Agence Boma", "loyer", 250, "USD", bom, "Mme Phoba", "monthly", 28),
            ("Internet fibre — Matadi", "internet", 85, "USD", mat, "Vodacom Business", "monthly", 5),
            ("Électricité SNEL — Dépôt", "electricite", 420000, "CDF", depot, "SNEL", "monthly", 25),
            ("Gardiennage Dépôt", "securite", 180, "USD", depot, "G4S Matadi", "monthly", 15),
            ("Nettoyage agences", "nettoyage", 150000, "CDF", mat, "Propre Services", "monthly", 10),
            ("Licence logiciel comptable", "internet", 240, "USD", depot, "Éditeur", "yearly", 2),
            ("Maintenance groupe électrogène", "maintenance", 350000, "CDF", depot, "Garage Ya Paulin", "quarterly", 20),
            ("Loyer Kinshasa Gombe", "loyer", 600, "USD", kin, "SCI Gombe", "monthly", 1),
        ]
        start_date = today.replace(day=1) - timedelta(days=62)
        for name, c, amount, cur, agency, ben, freq, day_ in charges:
            charge = RecurringCharge.objects.create(name=name, category=cat[c], amount=amount, currency=cur, agency=agency, beneficiary=ben,
                                                    frequency=freq, start_date=start_date.replace(day=1), due_day=day_, remind_days_before=5,
                                                    created_by=self.users["admin"])
            finance.generate_dues(charge=charge)
            for due in charge.dues.filter(due_date__lt=today - timedelta(days=3)).order_by("due_date"):
                if random.random() < 0.85:
                    finance.pay_due(due, self.users["admin"], self.methods["virement"] if cur == "USD" else self.methods["especes"])
        finance.refresh_due_statuses()


__all__ = ["date"]
