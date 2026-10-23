import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import ProductVisual from "../public/ProductVisual";
import "./photo-field.css";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Lit l'image côté navigateur : dimensions et présence d'un fond transparent (mêmes règles que le serveur). */
export function inspectImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement("canvas");
      const k = Math.min(1, 200 / Math.max(w, h));
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const alphaAt = (x, y) => data[(y * c.width + x) * 4 + 3];
      let clear = 0;
      let total = 0;
      for (let x = 0; x < c.width; x += 4) {
        total += 2;
        if (alphaAt(x, 0) < 16) clear += 1;
        if (alphaAt(x, c.height - 1) < 16) clear += 1;
      }
      for (let y = 0; y < c.height; y += 4) {
        total += 2;
        if (alphaAt(0, y) < 16) clear += 1;
        if (alphaAt(c.width - 1, y) < 16) clear += 1;
      }
      resolve({ url, width: w, height: h, cutout: total > 0 && clear / total >= 0.6 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Fichier illisible : envoyez une image JPG, PNG ou WebP."));
    };
    img.src = url;
  });
}

/**
 * Zone photo : glisser-déposer ou parcourir, contrôle immédiat, aperçu sur la couleur du produit.
 * - `onFile(file, info)` est appelé avec un fichier valide (envoi immédiat ou différé au choix du parent) ;
 * - `rules` : { minSide, minHeight, requireCutout } ;
 * - `tips` : consignes affichées à côté.
 */
export default function PhotoField({ image, cutout, accent, visual, onFile, onRemove, busy, rules = {}, tips = [], label = "Photo du produit" }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);
  useEffect(() => setPreview(null), [image]);

  const take = async (file) => {
    setError("");
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Format non accepté : JPG, PNG ou WebP uniquement.");
    if (file.size > MAX_BYTES) return setError("Image trop lourde : 8 Mo maximum.");
    try {
      const info = await inspectImage(file);
      const { minSide = 600, minHeight, requireCutout } = rules;
      if (minHeight && info.height < minHeight) return setError(`Image trop petite (${info.width}×${info.height} px) : au moins ${minHeight} px de haut.`);
      if (Math.min(info.width, info.height) < minSide) return setError(`Image trop petite (${info.width}×${info.height} px) : au moins ${minSide} px sur le petit côté.`);
      if (requireCutout && !info.cutout) return setError("Cette image a un fond plein. Pour la vitrine, il faut un PNG ou WebP détouré (fond transparent).");
      setPreview(info);
      await onFile(file, info);
    } catch (e) {
      setError(e.message);
    }
  };

  const shown = preview ? { image: preview.url, image_cutout: preview.cutout, accent, visual } : { image, image_cutout: cutout, accent, visual };
  const kind = shown.image ? (shown.image_cutout ? "Détourée : posée sur la couleur du produit" : "Fond plein : affichée en plein cadre") : "Pas de photo : l'illustration est utilisée";

  return (
    <div className="photo-field">
      <span className="field-label">{label}</span>
      <div className="photo-field-body">
        <div className="photo-field-preview" style={{ "--c": accent || "#6450FF" }}>
          <ProductVisual product={shown} size={110} />
        </div>
        <div className="photo-field-side">
          <button type="button" className={`photo-drop ${drag ? "drag" : ""}`} disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}>
            {busy ? <span className="spinner" /> : shown.image ? <Upload /> : <ImagePlus />}
            <span><strong>{shown.image ? "Remplacer la photo" : "Ajouter une photo"}</strong> — glissez-la ici ou cliquez</span>
          </button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="xs faint">{kind}</span>
          {error && <span className="photo-error" role="alert">{error}</span>}
          {(image || preview) && onRemove && (
            <button type="button" className="btn btn-ghost btn-sm photo-remove" disabled={busy} onClick={async () => { setPreview(null); await onRemove(); }}>
              <Trash2 /> Retirer la photo
            </button>
          )}
        </div>
      </div>
      {tips.length > 0 && (
        <ul className="photo-tips">
          {tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

export const PRODUCT_PHOTO_TIPS = [
  "Carré, 1200 × 1200 px idéalement (600 px minimum).",
  "Idéal : PNG ou WebP détouré (fond transparent). Sinon, JPG sur fond blanc uni.",
  "Le produit seul, centré, de face, occupant environ 80 % de la hauteur.",
  "Pas de prix, de texte ou de logo ajoutés. 8 Mo maximum.",
];
