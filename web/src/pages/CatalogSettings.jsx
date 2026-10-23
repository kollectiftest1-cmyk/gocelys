import { useQueryClient } from "@tanstack/react-query";
import {
  Apple, ArrowDown, ArrowUp, Baby, Beer, Boxes, Coffee, CornerDownRight, CupSoda, Droplet, Droplets, Layers, Milk, Package,
  Pencil, Plus, Ruler, Shirt, ShoppingBasket, Sparkles, SprayCan, Tag, Trash2, Wheat,
} from "lucide-react";
import { useMemo, useState } from "react";

import { del, patch, post } from "../api/client";
import { Drawer, Empty, Field, LoadingRows, PageHead, Pill, Tabs } from "../components/ui";
import { useList } from "../hooks/useList";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import "./catalog-admin.css";

/** Icônes proposées pour les catégories (nom enregistré → composant). */
export const CATEGORY_ICONS = {
  droplet: Droplet, droplets: Droplets, cup: CupSoda, coffee: Coffee, beer: Beer, milk: Milk, sparkles: Sparkles,
  "spray-can": SprayCan, wheat: Wheat, apple: Apple, basket: ShoppingBasket, package: Package, baby: Baby, shirt: Shirt,
  tag: Tag, layers: Layers,
};
const SWATCHES = ["#22C3E6", "#6450FF", "#F2A01F", "#16B36A", "#F25A3C", "#E5484D", "#0B9CC4", "#3B3B55", "#C2569B", "#8F80FF"];

export function CategoryIcon({ name, size = 18, color }) {
  const Icon = CATEGORY_ICONS[name] || Tag;
  return <Icon size={size} color={color} />;
}

function CategoryDrawer({ value, parents, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({ name: "", description: "", parent: "", icon: "tag", color: SWATCHES[0], is_active: true, ...value, parent: value?.parent || "" }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e });
  const isParent = !f.parent;
  const save = async () => {
    if (!f.name.trim()) return toast.error("Donnez un nom à la catégorie.");
    setBusy(true);
    try {
      const body = { name: f.name.trim(), description: f.description, parent: f.parent || null, icon: f.icon, color: f.color, is_active: f.is_active };
      if (f.id) await patch(`/categories/${f.id}/`, body);
      else await post("/categories/", body);
      toast.success(f.id ? "Catégorie mise à jour." : "Catégorie créée.");
      qc.invalidateQueries({ queryKey: ["/categories/"] });
      qc.invalidateQueries({ queryKey: ["ref", "categories"] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={f.id ? `Modifier « ${value.name} »` : "Nouvelle catégorie"}
      sub="Les catégories organisent le catalogue en caisse, sur le site et dans l'application"
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" disabled={busy} onClick={save}>Enregistrer</button></>}>
      <div className="stack">
        <div className="cat-preview" style={{ "--c": f.color }}>
          <span className="cat-icon"><CategoryIcon name={f.icon} size={22} color="#fff" /></span>
          <div>
            <strong>{f.name || "Nom de la catégorie"}</strong>
            <div className="xs muted">{isParent ? "Catégorie principale" : `Sous-catégorie de ${parents.find((p) => String(p.id) === String(f.parent))?.name || "…"}`}</div>
          </div>
        </div>
        <Field label="Nom"><input className="input" value={f.name} onChange={set("name")} placeholder="Hygiène et papier" autoFocus /></Field>
        <Field label="Rattachée à" hint="Laissez « Aucune » pour une catégorie principale. Deux niveaux maximum.">
          <select className="select" value={f.parent} onChange={set("parent")}>
            <option value="">Aucune (catégorie principale)</option>
            {parents.filter((p) => p.id !== f.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Description" hint="Affichée sur le site public pour les catégories principales">
          <input className="input" value={f.description} onChange={set("description")} placeholder="Mouchoirs, papier toilette, savons." />
        </Field>
        <div className="field">
          <span className="field-label">Icône</span>
          <div className="icon-grid">
            {Object.keys(CATEGORY_ICONS).map((k) => (
              <button key={k} type="button" className={f.icon === k ? "active" : ""} onClick={() => setF({ ...f, icon: k })} aria-label={k}>
                <CategoryIcon name={k} size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Couleur</span>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button key={c} type="button" className={f.color === c ? "active" : ""} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />
            ))}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active (proposée à la vente)</label>
      </div>
    </Drawer>
  );
}

function Categories() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const list = useList("/categories/");
  const [editing, setEditing] = useState(null);
  const manage = can("categories.manage");

  const tree = useMemo(() => {
    const parents = list.rows.filter((c) => !c.parent).sort((a, b) => a.position - b.position);
    return parents.map((p) => ({ ...p, children: list.rows.filter((c) => c.parent === p.id).sort((a, b) => a.position - b.position) }));
  }, [list.rows]);

  const remove = async (c) => {
    if (!window.confirm(`Supprimer la catégorie « ${c.name} » ?`)) return;
    try {
      await del(`/categories/${c.id}/`);
      toast.success("Catégorie supprimée.");
      qc.invalidateQueries({ queryKey: ["/categories/"] });
    } catch (e) {
      toast.error(e);
    }
  };
  const move = async (siblings, index, dir) => {
    const order = siblings.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    await post("/categories/reorder/", { order });
    qc.invalidateQueries({ queryKey: ["/categories/"] });
  };

  const Row = ({ c, siblings, index, child }) => (
    <div className={`cat-row ${child ? "child" : ""} ${c.is_active ? "" : "inactive"}`} style={{ "--c": c.color || "#6450FF" }}>
      {child && <CornerDownRight size={16} className="faint" />}
      <span className="cat-icon"><CategoryIcon name={c.icon} size={child ? 15 : 18} color="#fff" /></span>
      <div className="grow">
        <div className="strong">{c.name} {!c.is_active && <Pill plain>inactive</Pill>}</div>
        <div className="xs faint">{c.description || (child ? "Sous-catégorie" : "Catégorie principale")}</div>
      </div>
      {(() => {
        const n = c.products_count + (c.children || []).reduce((t, k) => t + k.products_count, 0);
        return <span className="small muted nowrap">{n} produit{n > 1 ? "s" : ""}{!child && c.children?.length ? " au total" : ""}</span>;
      })()}
      {manage && (
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm btn-icon" disabled={index === 0} onClick={() => move(siblings, index, -1)} aria-label="Monter"><ArrowUp /></button>
          <button className="btn btn-ghost btn-sm btn-icon" disabled={index === siblings.length - 1} onClick={() => move(siblings, index, 1)} aria-label="Descendre"><ArrowDown /></button>
          {!child && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing({ parent: c.id, color: c.color, icon: c.icon })} aria-label="Ajouter une sous-catégorie" title="Ajouter une sous-catégorie"><Plus /></button>}
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(c)} aria-label="Modifier"><Pencil /></button>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(c)} aria-label="Supprimer"><Trash2 /></button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div><h3>Arborescence du catalogue</h3><div className="sub">Catégorie principale › sous-catégorie. L'ordre est celui affiché en caisse et sur le site.</div></div>
          {manage && <button className="btn btn-action" onClick={() => setEditing({})}><Plus /> Nouvelle catégorie</button>}
        </div>
        {list.isLoading ? <LoadingRows rows={5} /> : tree.length === 0 ? (
          <Empty icon={Layers} title="Aucune catégorie">Créez vos univers : Eau et boissons, Hygiène et papier, Alimentation…</Empty>
        ) : (
          <div className="cat-tree">
            {tree.map((p, i) => (
              <div key={p.id} className="cat-group">
                <Row c={p} siblings={tree} index={i} />
                {p.children.map((c, j) => <Row key={c.id} c={c} siblings={p.children} index={j} child />)}
              </div>
            ))}
          </div>
        )}
      </section>
      {editing && <CategoryDrawer value={editing} parents={tree} onClose={() => setEditing(null)} />}
    </>
  );
}

function UnitDrawer({ value, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ code: "", name: "", plural: "", ...value });
  const save = async () => {
    try {
      const body = { code: f.code || f.name, name: f.name.trim(), plural: f.plural.trim() };
      if (f.id) await patch(`/units/${f.id}/`, body);
      else await post("/units/", body);
      toast.success(f.id ? "Unité mise à jour." : "Unité créée.");
      qc.invalidateQueries({ queryKey: ["/units/"] });
      qc.invalidateQueries({ queryKey: ["ref", "units"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Drawer open onClose={onClose} title={f.id ? `Modifier « ${value.name} »` : "Nouvelle unité"}
      sub="Unités de stock et conditionnements (pièce, boîte, rouleau, carton…)"
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" disabled={!f.name.trim()} onClick={save}>Enregistrer</button></>}>
      <div className="stack">
        <Field label="Nom (singulier)"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rouleau" autoFocus /></Field>
        <Field label="Pluriel"><input className="input" value={f.plural} onChange={(e) => setF({ ...f, plural: e.target.value })} placeholder="Rouleaux" /></Field>
        <Field label="Code" hint="Identifiant court sans espace. Laissé vide, il est déduit du nom.">
          <input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="rouleau" disabled={Boolean(f.id)} />
        </Field>
        <div className="callout">
          <Ruler />
          <span>Une unité sert de deux façons : comme <strong>unité de stock</strong> d'un produit (la plus petite vendue), ou comme <strong>conditionnement</strong> qui en contient plusieurs (1 paquet = 12 rouleaux). Le facteur se règle dans la fiche produit.</span>
        </div>
      </div>
    </Drawer>
  );
}

function Units() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const list = useList("/units/");
  const [editing, setEditing] = useState(null);
  const manage = can("categories.manage");
  const remove = async (u) => {
    if (!window.confirm(`Supprimer l'unité « ${u.name} » ?`)) return;
    try {
      await del(`/units/${u.id}/`);
      toast.success("Unité supprimée.");
      qc.invalidateQueries({ queryKey: ["/units/"] });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div><h3>Unités</h3><div className="sub">Une unité utilisée par un produit ne peut pas être supprimée.</div></div>
          {manage && <button className="btn btn-action" onClick={() => setEditing({})}><Plus /> Nouvelle unité</button>}
        </div>
        {list.isLoading ? <LoadingRows rows={5} /> : (
          <div className="unit-grid">
            {list.rows.map((u) => (
              <div key={u.id} className="unit-card">
                <div className="row-between">
                  <span className="code">{u.code}</span>
                  {manage && (
                    <span className="row" style={{ gap: 2 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(u)} aria-label="Modifier"><Pencil /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(u)} disabled={u.products_count > 0} aria-label="Supprimer"
                        title={u.products_count ? "Utilisée par des produits" : "Supprimer"}><Trash2 /></button>
                    </span>
                  )}
                </div>
                <strong>{u.name}</strong>
                <span className="xs faint">{u.plural || "—"} · {u.products_count ? `${u.products_count} produit(s)` : "non utilisée"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {editing && <UnitDrawer value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export default function CatalogSettings() {
  const [tab, setTab] = useState("categories");
  return (
    <>
      <PageHead title="Catégories et unités" lead="La structure du catalogue : univers de produits, sous-catégories et unités de vente. Réservé à la direction et à l'administration." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "categories", label: <span className="row" style={{ gap: 6 }}><Layers size={15} /> Catégories</span> },
        { value: "units", label: <span className="row" style={{ gap: 6 }}><Boxes size={15} /> Unités</span> },
      ]} />
      {tab === "categories" ? <Categories /> : <Units />}
    </>
  );
}
