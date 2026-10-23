"""
Traitement des images produits et vitrine.

Règles (affichées aussi dans l'interface) :
- formats acceptés : JPG, PNG, WebP — 8 Mo maximum ;
- au moins 600 px sur le petit côté (produits) ou 900 px de haut (vitrine) ;
- l'image est redressée (EXIF), réduite à 1200 px au plus et convertie en WebP ;
- la transparence est conservée : une image détourée (fond transparent) est repérée
  et affichée « posée » sur la couleur du produit, une photo à fond plein est affichée en plein cadre.
"""
from io import BytesIO
from uuid import uuid4

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.core.api import BusinessError

MAX_BYTES = 8 * 1024 * 1024
FORMATS = {"JPEG", "PNG", "WEBP"}


def _open(upload):
    if upload is None:
        raise BusinessError("Aucun fichier reçu.")
    if upload.size > MAX_BYTES:
        raise BusinessError("Image trop lourde : 8 Mo maximum.")
    try:
        img = Image.open(upload)
        img.load()
    except (UnidentifiedImageError, OSError):
        raise BusinessError("Fichier illisible : envoyez une image JPG, PNG ou WebP.")
    if img.format not in FORMATS:
        raise BusinessError(f"Format {img.format or 'inconnu'} non accepté : JPG, PNG ou WebP uniquement.")
    return ImageOps.exif_transpose(img)


def is_cutout(img):
    """Vrai si l'image a un fond transparent (les quatre coins et une bonne part des bords sont transparents)."""
    if img.mode not in ("RGBA", "LA", "PA"):
        if img.mode == "P" and "transparency" in img.info:
            img = img.convert("RGBA")
        else:
            return False
    alpha = img.convert("RGBA").getchannel("A")
    w, h = alpha.size
    border = [alpha.getpixel((x, 0)) for x in range(0, w, max(1, w // 40))]
    border += [alpha.getpixel((x, h - 1)) for x in range(0, w, max(1, w // 40))]
    border += [alpha.getpixel((0, y)) for y in range(0, h, max(1, h // 40))]
    border += [alpha.getpixel((w - 1, y)) for y in range(0, h, max(1, h // 40))]
    clear = sum(1 for a in border if a < 16)
    return clear / len(border) >= 0.6


def _trim(img, pad_ratio=0.06):
    """Recadre une image détourée au plus près du produit, avec une petite marge régulière."""
    rgba = img.convert("RGBA")
    box = rgba.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    if not box:
        return rgba
    rgba = rgba.crop(box)
    w, h = rgba.size
    pad = int(max(w, h) * pad_ratio)
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    canvas.paste(rgba, (pad, pad))
    return canvas


def process(upload, *, min_side=600, min_height=None, require_cutout=False, max_side=1200, folder="products"):
    """Valide et normalise une image. Retourne (ContentFile WebP, est_détourée, (largeur, hauteur))."""
    img = _open(upload)
    w, h = img.size
    if min_height and h < min_height:
        raise BusinessError(f"Image trop petite ({w}×{h} px) : il faut au moins {min_height} px de haut.")
    if min(w, h) < min_side:
        raise BusinessError(f"Image trop petite ({w}×{h} px) : il faut au moins {min_side} px sur le petit côté.")
    cutout = is_cutout(img)
    if require_cutout and not cutout:
        raise BusinessError("Pour la vitrine, l'image doit être détourée : un PNG ou WebP à fond transparent, produit seul.")
    if cutout:
        img = _trim(img)
    elif img.mode not in ("RGB",):
        img = img.convert("RGB")
    img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    out = BytesIO()
    img.save(out, "WEBP", quality=86, method=6)
    name = f"{uuid4().hex[:12]}.webp"
    return ContentFile(out.getvalue(), name=name), cutout, img.size


def delete_file(field_or_name, storage=None):
    """Supprime un fichier média. Accepte un FieldFile ou un nom (« products/abc.webp »)."""
    from django.core.files.storage import default_storage

    name = getattr(field_or_name, "name", field_or_name)
    if not name:
        return
    (storage or getattr(field_or_name, "storage", None) or default_storage).delete(name)
