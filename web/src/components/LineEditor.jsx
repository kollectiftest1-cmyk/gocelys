import { Plus, Trash2 } from "lucide-react";

import { useProducts } from "../hooks/useRef";
import { money, num } from "../lib/format";

/**
 * Saisie de lignes produit.
 * mode "units"  : choix du conditionnement (bouteille, pack, carton…) + prix — commandes.
 * mode "base"   : quantité en unité de stock — transferts.
 */
export default function LineEditor({ lines, onChange, mode = "units", stock }) {
  const products = useProducts().filter((p) => p.status === "active");
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const update = (i, patch) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i) => onChange(lines.filter((_, j) => j !== i));
  const add = () => onChange([...lines, { product: "", product_unit: "", quantity: 1 }]);

  const total = lines.reduce((s, l) => {
    const p = byId[l.product];
    const u = p?.units.find((x) => String(x.id) === String(l.product_unit));
    return s + (u ? Number(u.current_price) * Number(l.quantity || 0) : 0);
  }, 0);

  return (
    <div className="stack-sm">
      {lines.map((l, i) => {
        const p = byId[l.product];
        const unit = p?.units.find((x) => String(x.id) === String(l.product_unit));
        const available = stock && p ? stock[p.id] : undefined;
        return (
          <div key={i} className="line-row">
            <select className="select" value={l.product} aria-label="Produit"
              onChange={(e) => {
                const np = byId[e.target.value];
                update(i, { product: e.target.value, product_unit: np?.units.find((u) => u.is_default)?.id || np?.units[0]?.id || "" });
              }}>
              <option value="">Choisir un produit…</option>
              {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {mode === "units" ? (
              <select className="select" value={l.product_unit} onChange={(e) => update(i, { product_unit: e.target.value })} disabled={!p} aria-label="Conditionnement">
                {(p?.units || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_name}{Number(u.factor) > 1 ? ` ×${num(u.factor)}` : ""} — {money(u.current_price)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="small muted" style={{ alignSelf: "center" }}>
                {p ? p.base_unit_name.toLowerCase() + "s" : ""}
                {available !== undefined && <> · {num(available)} dispo.</>}
              </span>
            )}
            <input className="input num" type="number" min="1" step="1" value={l.quantity} aria-label="Quantité"
              onChange={(e) => update(i, { quantity: e.target.value })} />
            <span className="num small strong line-total">{mode === "units" && unit ? money(Number(unit.current_price) * Number(l.quantity || 0)) : ""}</span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(i)} aria-label="Retirer la ligne">
              <Trash2 />
            </button>
          </div>
        );
      })}
      <div className="row-between">
        <button type="button" className="btn btn-sm" onClick={add}>
          <Plus /> Ajouter un produit
        </button>
        {mode === "units" && total > 0 && <span className="strong num">{money(total)}</span>}
      </div>
    </div>
  );
}
