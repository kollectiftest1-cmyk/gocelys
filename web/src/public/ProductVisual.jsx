import ProductArt from "./ProductArt";
import "./product-visual.css";

/**
 * Visuel d'un produit partout sur le site et dans la gestion :
 * - photo détourée (fond transparent) : posée sur la couleur du produit, avec une ombre douce ;
 * - photo à fond plein : remplit tout le cadre (le parent doit être en position relative) ;
 * - pas de photo : illustration vectorielle déduite de la forme et de la couleur.
 */
export default function ProductVisual({ product, size = 120, bg = true }) {
  const p = product || {};
  if (p.image && p.image_cutout) {
    return <img className="pv-cut" src={p.image} alt="" width={size} height={Math.round(size * 1.25)} loading="lazy" decoding="async" draggable="false" />;
  }
  if (p.image) {
    return <img className="pv-photo" src={p.image} alt="" loading="lazy" decoding="async" draggable="false" />;
  }
  return <ProductArt visual={p.visual} accent={p.accent} size={size} bg={bg} />;
}
