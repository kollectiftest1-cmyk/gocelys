import { useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api, del } from "../api/client";
import PhotoField, { PRODUCT_PHOTO_TIPS } from "../components/PhotoField";
import ProductVisual from "../public/ProductVisual";
import { Drawer, Empty, Field, LoadingRows, PageHead, Pager, Pill } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { useCategories, useUnits } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { money, num } from "../lib/format";
import { useToast } from "../lib/toast";

const EMPTY = { code: "", name: "", category: "", base_unit: "", price: "", promo_price: "", promo_until: "", min_stock: 0, max_stock: 0, barcode: "", description: "", status: "active", sold_online: true, accent: "#22C3E6", visual: "pack", is_featured: false, units: [] };

const VISUALS = { bottle: "Bouteille", jug: "Bidon / fontaine", can: "Canette", sachet: "Sachet", box: "Boîte (mouchoirs…)", roll: "Rouleaux", pack: "Paquet / carton", sack: "Sac", jar: "Pot / flacon", bar: "Pain de savon" };

function ProductDrawer({ product, onClose }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useCategories();
  const units = useUnits();
  const [form, setForm] = useState(EMPTY);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (product) setForm(product.id ? { ...EMPTY, ...product, promo_price: product.promo_price ?? "", promo_until: product.promo_until ?? "" } : EMPTY);
    setPendingPhoto(null);
  }, [product]);
  if (!product) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const packs = form.units.filter((u) => String(u.unit) !== String(form.base_unit));
  const setPack = (i, patch) => {
    const next = [...packs];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, units: [...form.units.filter((u) => String(u.unit) === String(form.base_unit)), ...next] });
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...form, image: undefined, promo_price: form.promo_price === "" ? null : form.promo_price, promo_until: form.promo_until || null,
        units: form.units.filter((u) => u.unit && u.factor).map((u) => ({ id: u.id, unit: Number(u.unit), factor: u.factor, price: u.price || 0, barcode: u.barcode || "", is_default: Boolean(u.is_default) })),
      };
      delete body.image;
      const r = form.id ? await api.patch(`/products/${form.id}/`, body) : await api.post("/products/", body);
      if (pendingPhoto) await uploadPhoto(r.data.id, pendingPhoto);
      toast.success(form.id ? "Produit mis à jour." : "Produit créé.");
      qc.invalidateQueries({ queryKey: ["/products/"] });
      qc.invalidateQueries({ queryKey: ["ref", "products"] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/products/"] });
    qc.invalidateQueries({ queryKey: ["ref", "products"] });
  };
  const uploadPhoto = async (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await api.post(`/products/${id}/image/`, fd);
    return r.data;
  };
  // Produit existant : la photo est envoyée tout de suite. Nouveau produit : elle part à l'enregistrement.
  const onPhoto = async (file) => {
    if (!form.id) {
      setPendingPhoto(file);
      return;
    }
    setPhotoBusy(true);
    try {
      const data = await uploadPhoto(form.id, file);
      setForm((f) => ({ ...f, image: data.image, image_cutout: data.image_cutout }));
      toast.success(data.image_cutout ? "Photo détourée enregistrée." : "Photo enregistrée (fond plein, affichée en plein cadre).");
      refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    if (!form.id) {
      setPendingPhoto(null);
      return;
    }
    setPhotoBusy(true);
    try {
      await api.delete(`/products/${form.id}/image/`);
      setForm((f) => ({ ...f, image: null, image_cutout: false }));
      toast.success("Photo retirée : l'illustration est de nouveau utilisée.");
      refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setPhotoBusy(false);
    }
  };
  const archive = async () => {
    try {
      await del(`/products/${form.id}/`);
      toast.success("Produit archivé : il n'est plus proposé à la vente.");
      qc.invalidateQueries({ queryKey: ["/products/"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  const priceLocked = form.id && !can("prices.manage");
  return (
    <Drawer open onClose={onClose} wide title={form.id ? form.name : "Nouveau produit"} sub={form.id ? form.code : "Fiche produit et conditionnements"}
      footer={<>
        {form.id && can("products.delete") && <button className="btn btn-danger" onClick={archive}><Trash2 /> Archiver</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        {can("products.manage") && <button className="btn btn-action" disabled={busy} onClick={save}>Enregistrer</button>}
      </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Nom"><input className="input" value={form.name} onChange={set("name")} placeholder="Eau Gocelsys 1,5 L" /></Field>
          <Field label="Code produit"><input className="input" value={form.code} onChange={set("code")} placeholder="EB-150" /></Field>
          <Field label="Catégorie">
            <select className="select" value={form.category} onChange={set("category")}>
              <option value="">Choisir…</option>
              {categories.filter((c) => !c.parent).map((p) => (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name} (général)</option>
                  {categories.filter((c) => c.parent === p.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Unité de stock" hint="La plus petite unité vendue (bouteille, sachet…)">
            <select className="select" value={form.base_unit} onChange={set("base_unit")} disabled={Boolean(form.id)}>
              <option value="">Choisir…</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Prix unitaire (FC)" hint={priceLocked ? "Modification réservée aux personnes autorisées" : undefined}>
            <input className="input num" type="number" value={form.price} onChange={set("price")} disabled={priceLocked} />
          </Field>
          <Field label="Prix promotionnel (FC)">
            <input className="input num" type="number" value={form.promo_price} onChange={set("promo_price")} disabled={priceLocked} placeholder="Aucun" />
          </Field>
          <Field label="Promotion jusqu'au"><input className="input" type="date" value={form.promo_until} onChange={set("promo_until")} disabled={priceLocked} /></Field>
          <Field label="Code-barres"><input className="input" value={form.barcode} onChange={set("barcode")} /></Field>
          <Field label="Seuil minimum (alerte)"><input className="input num" type="number" value={form.min_stock} onChange={set("min_stock")} /></Field>
          <Field label="Stock maximum"><input className="input num" type="number" value={form.max_stock} onChange={set("max_stock")} /></Field>
          <Field label="Description" className="span-2"><textarea className="textarea" value={form.description} onChange={set("description")} /></Field>
          <Field label="Couleur d'étiquette"><input className="input" type="color" value={form.accent || "#22C3E6"} onChange={set("accent")} style={{ padding: 4 }} /></Field>
          <Field label="Forme de l'illustration" hint="Utilisée sur le site et dans les apps tant qu'il n'y a pas de photo">
            <select className="select" value={form.visual} onChange={set("visual")}>
              {Object.entries(VISUALS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
        {can("products.manage") && (
          <PhotoField image={form.image} cutout={form.image_cutout} accent={form.accent} visual={form.visual}
            onFile={onPhoto} onRemove={form.image || pendingPhoto ? removePhoto : null} busy={photoBusy}
            tips={PRODUCT_PHOTO_TIPS} label={form.id ? "Photo du produit" : "Photo du produit (envoyée à l'enregistrement)"} />
        )}
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="check"><input type="checkbox" checked={form.sold_online} onChange={set("sold_online")} /> Visible sur le site et l'application client</label>
          <label className="check"><input type="checkbox" checked={form.is_featured} onChange={set("is_featured")} /> Mis en avant sur la page d'accueil</label>
          <label className="check"><input type="checkbox" checked={form.status === "active"} onChange={(e) => setForm({ ...form, status: e.target.checked ? "active" : "inactive" })} /> Actif à la vente</label>
        </div>
        <div className="divider" />
        <div className="row-between">
          <div>
            <h3 style={{ fontSize: "var(--fs-md)" }}>Conditionnements</h3>
            <p className="xs faint">Ex. 1 carton = 24 bouteilles. Le stock reste tenu en unité de stock : aucune erreur de conversion possible.</p>
          </div>
          <button className="btn btn-sm" onClick={() => setForm({ ...form, units: [...form.units, { unit: "", factor: "", price: "", barcode: "" }] })}><Plus /> Ajouter</button>
        </div>
        {packs.length === 0 && <p className="small muted">Vendu uniquement à l'unité.</p>}
        {packs.map((u, i) => (
          <div key={i} className="line-row" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1.2fr 30px" }}>
            <select className="select" value={u.unit} onChange={(e) => setPack(i, { unit: e.target.value })} aria-label="Unité">
              <option value="">Unité…</option>
              {units.filter((x) => String(x.id) !== String(form.base_unit)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input className="input num" type="number" placeholder="Contient" value={u.factor} onChange={(e) => setPack(i, { factor: e.target.value })} aria-label="Facteur" />
            <input className="input num" type="number" placeholder="Prix FC" value={u.price} onChange={(e) => setPack(i, { price: e.target.value })} aria-label="Prix" disabled={priceLocked} />
            <input className="input" placeholder="Code-barres" value={u.barcode || ""} onChange={(e) => setPack(i, { barcode: e.target.value })} />
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setForm({ ...form, units: form.units.filter((x) => x !== u) })} aria-label="Retirer"><Trash2 /></button>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

export default function Products() {
  const [sp] = useSearchParams();
  const { can } = useAuth();
  const categories = useCategories();
  const [search, setSearch] = useState(sp.get("search") || "");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(null);
  const q = useDebounced(search);
  const list = useList("/products/", { search: q, category, stock_agency: "all" });
  return (
    <>
      <PageHead title="Produits" lead="Catalogue, prix, conditionnements et seuils d'alerte. Toute modification de prix est journalisée."
        actions={can("products.manage") && <button className="btn btn-action" onClick={() => setOpen({})}><Plus /> Nouveau produit</button>} />
      <section className="panel">
        <div className="toolbar">
          <div className="input-group">
            <Search />
            <input className="input" placeholder="Nom, code, code-barres" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.products_count})</option>)}
          </select>
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={Package} title="Aucun produit" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Produit</th><th>Catégorie</th><th>Conditionnements</th><th className="num">Prix</th><th className="num">Stock réseau</th><th>Statut</th></tr></thead>
              <tbody>
                {list.rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => setOpen(p)}>
                    <td>
                      <div className="row">
                        <span className="prod-thumb" style={{ "--c": p.accent || "#6450FF" }}><ProductVisual product={p} size={30} bg={false} /></span>
                        <div><div className="cell-main">{p.name}</div><div className="cell-sub">{p.code} · {p.base_unit_name.toLowerCase()}</div></div>
                      </div>
                    </td>
                    <td className="small">{p.category_name}</td>
                    <td className="small muted">{p.units.filter((u) => Number(u.factor) > 1).map((u) => `${u.unit_name} ×${num(u.factor)}`).join(" · ") || "—"}</td>
                    <td className="num">
                      <strong>{money(p.current_price)}</strong>
                      {p.promo_price && Number(p.promo_price) === Number(p.current_price) && <div><Pill tone="coral" plain>Promo</Pill></div>}
                    </td>
                    <td className="num">{num(p.stock?.available || 0)}{p.stock?.reserved ? <div className="cell-sub">{num(p.stock.reserved)} réservés</div> : null}</td>
                    <td>{p.status === "active" ? <Pill tone="leaf" plain>Actif</Pill> : <Pill plain>{p.status_label}</Pill>}{!p.sold_online && <div className="cell-sub">hors appli</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      <ProductDrawer product={open} onClose={() => setOpen(null)} />
    </>
  );
}
