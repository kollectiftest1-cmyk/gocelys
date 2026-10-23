import { Minus, Plus, Search, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { Empty, Skeleton } from "../components/ui";
import { money, num } from "../lib/format";
import { useToast } from "../lib/toast";
import ProductVisual from "./ProductVisual";
import { useCatalog, useShop } from "./boutique-store";
import "./shop.css";

function AgencyPicker() {
  const shop = useShop();
  if (!shop.agencies.length) return null;
  return (
    <label className="shop-agency">
      <span>Agence</span>
      <select value={shop.agencyId || ""} onChange={(e) => shop.setAgency(Number(e.target.value))}>
        {shop.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

export function Shop() {
  const shop = useShop();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const cat = sp.get("categorie") ? Number(sp.get("categorie")) : null;
  const { data, isLoading } = useCatalog();
  const parents = shop.categories.filter((c) => !c.parent);
  const children = cat ? shop.categories.filter((c) => c.parent === cat) : [];
  const sub = sp.get("sous") ? Number(sp.get("sous")) : null;

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data || []).filter((p) => {
      if (cat && p.category !== cat && p.category_parent !== cat) return false;
      if (sub && p.category !== sub) return false;
      return !s || p.name.toLowerCase().includes(s) || p.category_name.toLowerCase().includes(s);
    });
  }, [data, cat, sub, q]);

  const setCat = (id) => {
    const next = new URLSearchParams(sp);
    if (id) next.set("categorie", id);
    else next.delete("categorie");
    next.delete("sous");
    setSp(next, { replace: true });
  };
  const setSub = (id) => {
    const next = new URLSearchParams(sp);
    if (id) next.set("sous", id);
    else next.delete("sous");
    setSp(next, { replace: true });
  };

  return (
    <div className="pub-page shop">
      <div className="shop-head">
        <div>
          <h1>Nos produits</h1>
          <p className="pub-lead">Prix et stock en temps réel de l'agence choisie. Ajoutez au panier, puis choisissez livraison ou retrait.</p>
        </div>
        <AgencyPicker />
      </div>
      <div className="shop-bar">
        <div className="shop-cats" role="tablist">
          <button className={!cat ? "active" : ""} onClick={() => setCat(null)}>Tout</button>
          {parents.map((c) => (
            <button key={c.id} className={cat === c.id ? "active" : ""} style={{ "--c": c.color || "#6450FF" }} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
        <label className="shop-search">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher : eau, mouchoirs, riz…" aria-label="Rechercher un produit" />
        </label>
      </div>
      {children.length > 0 && (
        <div className="shop-subs">
          <button className={!sub ? "active" : ""} onClick={() => setSub(null)}>Toute la catégorie</button>
          {children.map((c) => <button key={c.id} className={sub === c.id ? "active" : ""} onClick={() => setSub(c.id)}>{c.name}</button>)}
        </div>
      )}
      {isLoading ? (
        <div className="shop-grid">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={330} style={{ borderRadius: 24 }} />)}</div>
      ) : items.length === 0 ? (
        <Empty icon={Search} title="Aucun produit trouvé">Essayez un autre mot ou une autre catégorie.</Empty>
      ) : (
        <div className="shop-grid">
          {items.map((p) => {
            const unit = p.units.find((u) => Number(u.factor) === 1) || p.units[0];
            const promo = Number(p.current_price) < Number(p.price);
            const packs = p.units.filter((u) => Number(u.factor) > 1);
            return (
              <article key={p.id} className={`shop-card ${p.in_stock ? "" : "out"}`} style={{ "--c": p.accent || "#6450FF" }}>
                <Link to={`/boutique/${p.id}`} className="shop-art" aria-label={p.name}>
                  <ProductVisual product={p} size={120} />
                  {promo && <span className="tag promo">Promo</span>}
                  {!p.in_stock && <span className="tag out">Épuisé ici</span>}
                </Link>
                <div className="shop-body">
                  <span className="shop-cat">{p.category_name}</span>
                  <Link to={`/boutique/${p.id}`} className="shop-name">{p.name}</Link>
                  {packs.length > 0 && <span className="shop-packs">Aussi en {packs.map((u) => `${u.unit.toLowerCase()} de ${num(u.factor)}`).join(", ")}</span>}
                  <div className="shop-foot">
                    <div>
                      <strong>{money(p.current_price)}</strong>
                      {promo ? <s>{money(p.price)}</s> : <span>le {p.base_unit.toLowerCase()}</span>}
                    </div>
                    <button className="shop-add" aria-label={`Ajouter ${p.name} au panier`} disabled={!p.in_stock} onClick={() => { shop.add(p, unit); toast.success(`${p.name} ajouté au panier.`); }}>
                      <Plus size={18} /> <span className="shop-add-label">Ajouter</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {shop.count > 0 && (
        <Link to="/panier" className="shop-float">
          <ShoppingBag size={20} />
          <span>{num(shop.count)} article{shop.count > 1 ? "s" : ""}</span>
          <strong>{money(shop.subtotal)}</strong>
        </Link>
      )}
    </div>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const shop = useShop();
  const toast = useToast();
  const { data, isLoading } = useCatalog();
  const p = (data || []).find((x) => String(x.id) === String(id));
  const [unitId, setUnitId] = useState(null);
  const [qty, setQty] = useState(1);
  if (isLoading) return <div className="pub-page"><Skeleton h={480} style={{ borderRadius: 32 }} /></div>;
  if (!p) return <div className="pub-page"><Empty title="Produit introuvable" action={<Link to="/boutique" className="pub-btn primary">Retour aux produits</Link>} /></div>;
  const unit = p.units.find((u) => u.id === unitId) || p.units.find((u) => Number(u.factor) === 1) || p.units[0];
  const saving = Number(unit.factor) > 1 ? Number(p.current_price) * Number(unit.factor) - Number(unit.current_price) : 0;
  const related = (data || []).filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
  return (
    <div className="pub-page">
      <nav className="crumbs"><Link to="/boutique">Produits</Link> <span>/</span> <Link to={`/boutique?categorie=${p.category_parent || p.category}`}>{p.category_name}</Link></nav>
      <div className="pp">
        <div className="pp-art" style={{ "--c": p.accent || "#6450FF" }}>
          <ProductVisual product={p} size={300} />
        </div>
        <div className="pp-info">
          <span className="shop-cat">{p.category_name}</span>
          <h1>{p.name}</h1>
          {p.description && <p className="pub-lead">{p.description}</p>}
          <div className="pp-formats" role="radiogroup" aria-label="Format">
            {p.units.map((u) => (
              <button key={u.id} role="radio" aria-checked={u.id === unit.id} className={u.id === unit.id ? "active" : ""} disabled={!u.in_stock} onClick={() => setUnitId(u.id)}>
                <span>
                  <strong>{u.unit}{Number(u.factor) > 1 ? ` de ${num(u.factor)}` : ""}</strong>
                  <em>{!u.in_stock ? "Indisponible dans cette agence" : Number(u.factor) > 1 ? `soit ${money(Number(u.current_price) / Number(u.factor))} l'unité` : "à l'unité"}</em>
                </span>
                <b>{money(u.current_price)}</b>
              </button>
            ))}
          </div>
          {saving > 0 && <p className="pp-saving">Vous économisez {money(saving)} par rapport à l'achat à l'unité.</p>}
          <div className="pp-buy">
            <div className="qty-pill">
              <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Moins"><Minus size={16} /></button>
              <span>{qty}</span>
              <button onClick={() => setQty(qty + 1)} aria-label="Plus"><Plus size={16} /></button>
            </div>
            <button className="pub-btn primary pp-add" disabled={!unit.in_stock} onClick={() => { shop.add(p, unit, qty); toast.success("Ajouté au panier."); }}>
              Ajouter · {money(Number(unit.current_price) * qty)}
            </button>
          </div>
          <button className="pp-checkout" onClick={() => { shop.add(p, unit, qty); navigate("/panier"); }} disabled={!unit.in_stock}>Commander maintenant</button>
          <p className="xs faint">Stock de {shop.agency?.name}. Prix TTC en francs congolais.</p>
        </div>
      </div>
      {related.length > 0 && (
        <section className="pp-related">
          <h2>Dans la même catégorie</h2>
          <div className="shop-grid">
            {related.map((r) => (
              <Link key={r.id} to={`/boutique/${r.id}`} className="shop-card mini" style={{ "--c": r.accent || "#6450FF" }}>
                <span className="shop-art"><ProductVisual product={r} size={90} /></span>
                <span className="shop-body"><span className="shop-name">{r.name}</span><strong>{money(r.current_price)}</strong></span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
