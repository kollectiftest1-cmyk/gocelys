"""Univers de la vitrine par défaut (utilisés par la migration et la démonstration)."""

DEFAULT_SLIDES = [
    {"word": "Eau", "title": "L'eau de toute la famille, du sachet à la fontaine.",
     "text": "Sachets, bouteilles, bidons et bonbonnes de 19 litres, livrés à la maison comme au bureau.",
     "color": "#0B8DB5", "model": "bottle", "label_title": "Eau minérale", "label_sub": "1,5 L", "category": "Eau et boissons"},
    {"word": "Papier", "title": "Mouchoirs, papier toilette, serviettes.",
     "text": "À la boîte, au paquet ou au carton : l'essentiel de l'hygiène toujours en stock dans votre agence.",
     "color": "#4B35E0", "model": "box", "label_title": "Mouchoirs doux", "label_sub": "100 feuilles · 3 plis", "category": "Hygiène et papier"},
    {"word": "Boissons", "title": "Jus et sodas, à l'unité ou au carton.",
     "text": "Pour la maison, la boutique ou la fête : commandez le volume qu'il vous faut.",
     "color": "#E5482B", "model": "can", "label_title": "Jus tropical", "label_sub": "33 cl", "category": "Eau et boissons"},
    {"word": "Maison", "title": "Et tout le reste du panier.",
     "text": "Savon, lessive, javel, riz, sucre, huile. Un seul fournisseur pour vos achats du quotidien.",
     "color": "#0E8A55", "model": "pump", "label_title": "Savon liquide", "label_sub": "500 ml", "category": "Entretien de la maison"},
]


def create_default_slides(Slide, Category):
    if Slide.objects.exists():
        return
    for i, d in enumerate(DEFAULT_SLIDES):
        data = dict(d)
        cat = Category.objects.filter(name=data.pop("category"), parent=None).first()
        Slide.objects.create(position=i, category=cat, **data)
