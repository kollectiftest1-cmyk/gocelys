"""
Génère, pour chaque produit du catalogue, un prompt prêt à coller dans ChatGPT (ou tout générateur d'images)
pour obtenir une photo conforme aux règles de Gocelsys (détourée, cadrée, sans texte ajouté).

    python manage.py prompts_photos                         # tous les produits actifs → Markdown à l'écran
    python manage.py prompts_photos --out prompts.md        # dans un fichier
    python manage.py prompts_photos --produit AL-RIZ        # un seul produit (code)
    python manage.py prompts_photos --vitrine               # format vertical pour la vitrine 3D
    python manage.py prompts_photos --sans-marque           # étiquette neutre (produits revendus d'autres marques)
"""
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.catalog.models import Product

# Forme d'illustration → description du conditionnement pour le générateur
PACKAGING = {
    "bottle": "bouteille en plastique PET transparent, bouchon vissé, étiquette enroulée autour du corps",
    "jug": "grande bonbonne ou bidon en plastique bleuté translucide avec poignée et bouchon",
    "can": "canette en aluminium, étiquette imprimée directement sur le métal, opercule visible",
    "sachet": "sachet souple en plastique transparent scellé aux deux extrémités, contenu visible",
    "box": "boîte en carton parallélépipédique, une feuille de mouchoir qui dépasse de l'ouverture sur le dessus",
    "roll": "paquet de rouleaux blancs emballés sous film plastique souple, étiquette sur le devant",
    "pack": "paquet ou carton rectangulaire, faces nettes, étiquette sur la face avant",
    "sack": "sac souple en papier kraft ou tissu tissé, haut cousu ou replié, étiquette rectangulaire au centre",
    "jar": "flacon en plastique avec pompe ou bouchon, étiquette sur le devant",
    "bar": "pain de savon rectangulaire, posé à plat, légèrement de biais pour montrer l'épaisseur",
}

COLOR_NAMES = [  # repères pour décrire la couleur d'étiquette en mots (les générateurs comprennent mieux)
    ((34, 195, 230), "bleu ciel"), ((11, 141, 181), "bleu océan"), ((100, 80, 255), "violet"), ((75, 53, 224), "indigo"),
    ((242, 90, 60), "corail"), ((229, 72, 43), "rouge orangé"), ((22, 179, 106), "vert"), ((14, 138, 85), "vert sapin"),
    ((242, 160, 31), "orange doré"), ((234, 190, 40), "jaune"), ((201, 161, 90), "beige kraft"), ((60, 60, 85), "gris anthracite"),
    ((194, 86, 155), "rose framboise"), ((255, 255, 255), "blanc"), ((20, 18, 58), "bleu nuit"),
]


def color_name(hex_color):
    try:
        h = hex_color.lstrip("#")
        rgb = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except (ValueError, AttributeError):
        return "bleu ciel"
    return min(COLOR_NAMES, key=lambda c: sum((a - b) ** 2 for a, b in zip(c[0], rgb)))[1]


def build_prompt(p, *, vitrine=False, sans_marque=False):
    accent = p.accent or "#22C3E6"
    packaging = PACKAGING.get(p.visual, PACKAGING["pack"])
    desc = (p.description or "").strip().rstrip(".")
    brand = ("étiquette sobre et neutre, SANS nom de marque ni logo, seulement le nom du produit en lettres simples"
             if sans_marque else
             "étiquette sobre et moderne avec le nom de marque « gocelsys » écrit en minuscules, police sans empattement grasse, orthographe exacte")
    if vitrine:
        frame = ("Format vertical 2:3 (1024 × 1536 px). Le produit, debout et droit, occupe environ 85 % de la hauteur, "
                 "centré, avec la même marge en haut et en bas.")
        light = ("Éclairage studio doux avec un léger contre-jour sur les bords (liseré lumineux) pour détacher la silhouette ; "
                 "aspect premium, matières réalistes (reflets du plastique ou du métal bien rendus).")
    else:
        frame = ("Format carré 1:1 (1024 × 1024 px). Le produit, vu de face avec une très légère rotation de trois-quarts, "
                 "occupe environ 80 % de la hauteur, parfaitement centré, marges égales autour.")
        light = "Éclairage studio doux et homogène (boîte à lumière), couleurs fidèles, aucune zone brûlée, ombres internes légères."
    return "\n".join([
        f"Photographie produit professionnelle de type packshot e-commerce : « {p.name} »"
        + (f" — {desc}." if desc else "."),
        f"Conditionnement : {packaging}.",
        f"Étiquette : {brand}, couleur dominante {color_name(accent)} ({accent.upper()}) avec du blanc.",
        frame,
        "FOND TRANSPARENT : image PNG avec canal alpha, aucun décor, aucune ombre portée au sol, aucun reflet de surface.",
        light,
        "Rendu photographique réaliste et net (pas d'illustration, pas de dessin, pas de 3D cartoon).",
        "Interdits : prix, texte ajouté autour du produit, filigrane, mains, personnes, accessoires, plusieurs exemplaires, "
        "logo ou marque existante d'une autre entreprise.",
    ])


class Command(BaseCommand):
    help = "Prompts de génération de photos produits (ChatGPT, etc.) adaptés aux règles d'image de Gocelsys."

    def add_arguments(self, parser):
        parser.add_argument("--produit", help="Code d'un produit (ex. AL-RIZ). Par défaut : tous les produits actifs.")
        parser.add_argument("--vitrine", action="store_true", help="Format vertical pour un univers « Ma photo » de la vitrine 3D.")
        parser.add_argument("--sans-marque", action="store_true", help="Étiquette neutre, sans « gocelsys » (produits d'autres marques).")
        parser.add_argument("--sans-photo", action="store_true", help="Seulement les produits qui n'ont pas encore de photo.")
        parser.add_argument("--out", help="Écrire le résultat dans ce fichier Markdown.")

    def handle(self, *args, **o):
        qs = Product.objects.exclude(status="archived").select_related("category", "base_unit").order_by("category__name", "name")
        if o["produit"]:
            qs = qs.filter(code__iexact=o["produit"])
            if not qs.exists():
                raise CommandError(f"Aucun produit avec le code « {o['produit']} ».")
        if o["sans_photo"]:
            qs = qs.filter(Q(image="") | Q(image__isnull=True))
        kind = "vitrine 3D (vertical)" if o["vitrine"] else "fiche produit (carré)"
        lines = [
            f"# Prompts photos — {kind}",
            "",
            "Mode d'emploi :",
            "1. Collez un prompt dans ChatGPT (génération d'images).",
            "2. Si le fond n'est pas transparent, répondez : « Même image, fond transparent PNG, sans ombre ».",
            "3. Vérifiez l'orthographe de l'étiquette et que le produit ressemble bien à celui que vous vendez.",
            "4. Téléchargez le PNG, puis Produits → fiche → Photo du produit"
            + (" (ou Site public → univers → Ma photo)." if o["vitrine"] else "."),
            "",
        ]
        for p in qs:
            lines += [
                f"## {p.name}  ·  `{p.code}`  ·  {p.category.name}",
                "",
                "```text",
                build_prompt(p, vitrine=o["vitrine"], sans_marque=o["sans_marque"]),
                "```",
                "",
            ]
        text = "\n".join(lines)
        if o["out"]:
            with open(o["out"], "w", encoding="utf-8") as fh:
                fh.write(text)
            self.stdout.write(self.style.SUCCESS(f"{qs.count()} prompt(s) écrit(s) dans {o['out']}"))
        else:
            self.stdout.write(text)
