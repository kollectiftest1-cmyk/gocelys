import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ExternalLink, Eye, EyeOff, ImagePlus, Pencil, Plus, Search, ShoppingBag, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { api, del, get, post } from "../api/client";
import PhotoField from "../components/PhotoField";
import { Drawer, Empty, Field, LoadingRows, PageHead, Pill, Tabs } from "../components/ui";
import { useCategories } from "../hooks/useRef";
import { useList } from "../hooks/useList";
import { useToast } from "../lib/toast";
import ProductArt from "../public/ProductArt";
import ProductVisual from "../public/ProductVisual";
import "./catalog-admin.css";
import "./site-public.css";

const MODELS = [
  { key: "bottle", label: "Bouteille", visual: "bottle" },
  { key: "box", label: "Boîte", visual: "box" },
  { key: "can", label: "Canette", visual: "can" },
  { key: "pump", label: "Flacon pompe", visual: "jar" },
  { key: "photo", label: "Ma photo", visual: null },
];
const SWATCHES = ["#0B8DB5", "#4B35E0", "#E5482B", "#0E8A55", "#C2569B", "#C77700", "#2C2873", "#0F766E", "#B4235A", "#6D4C2F"];
const EMPTY = { word: "", title: "", text: "", color: "#4B35E0", model: "bottle", label_title: "", label_sub: "", category: "", is_active: true, image: null };
const MAX_ACTIVE = 6;

const SHOWCASE_TIPS = [
  "PNG ou WebP détouré obligatoire : fond transparent, produit seul, sans ombre (la vitrine ajoute la sienne).",
  "Format vertical, 1200 × 1600 px idéalement (900 px de haut minimum).",
  "Produit de face, bien net, éclairage uniforme, étiquette lisible.",
  "8 Mo maximum. L'image est recadrée au ras du produit et convertie en WebP.",
];

/** Contraste du texte blanc sur la couleur de fond (WCAG). */
function whiteContrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [16, 8, 0].map((s) => {
    const c = ((n >> s) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return 1.05 / (L + 0.05);
}

function SlidePoster({ slide, compact = false }) {
  const model = MODELS.find((m) => m.key === slide.model);
  const photo = slide.model === "photo" && slide.image;
  return (
    <div className={`poster ${compact ? "compact" : ""}`} style={{ "--bg": slide.color || "#4B35E0" }}>
      <span className="poster-word" aria-hidden="true">{slide.word || "Mot"}</span>
      <div className="poster-object">
        {photo ? <img src={slide.image} alt="" /> : model?.visual
          ? <ProductArt visual={model.visual} accent="#ffffff" size={compact ? 70 : 120} bg={false} />
          : <ImagePlus size={compact ? 30 : 44} />}
      </div>
      <div className="poster-copy">
        <strong>{slide.title || "Titre de l'univers"}</strong>
        {!compact && <p>{slide.text || "Le texte d'accroche apparaît ici."}</p>}
        {!compact && <span className="poster-cta"><ShoppingBag size={14} /> {slide.category ? "Voir ces produits" : "Voir les produits"}</span>}
      </div>
    </div>
  );
}

function SlideDrawer({ value, activeCount, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useCategories();
  const [f, setF] = useState(() => ({ ...EMPTY, ...value, category: value.category ?? "" }));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const contrast = /^#[0-9a-f]{6}$/i.test(f.color) ? whiteContrast(f.color) : 21;
  const wouldExceed = f.is_active && !value.is_active && activeCount >= MAX_ACTIVE;

  const save = async () => {
    if (!f.word.trim() || !f.title.trim()) return toast.error("Le mot et le titre sont obligatoires.");
    setBusy(true);
    try {
      const fields = {
        word: f.word.trim(), title: f.title.trim(), text: f.text.trim(), color: f.color, model: f.model,
        label_title: f.label_title.trim(), label_sub: f.label_sub.trim(), category: f.category || null, is_active: f.is_active,
      };
      let body = fields;
      if (file) {
        body = new FormData();
        Object.entries(fields).forEach(([k, v]) => body.append(k, v === null ? "" : String(v)));
        body.append("upload", file);
      }
      if (f.id) await api.patch(`/site/showcase/${f.id}/`, body);
      else await api.post("/site/showcase/", body);
      toast.success(f.id ? "Univers mis à jour : visible tout de suite sur le site." : "Univers ajouté à la vitrine.");
      qc.invalidateQueries({ queryKey: ["/site/showcase/"] });
      qc.invalidateQueries({ queryKey: ["public-home"] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const shown = { ...f, image: preview || f.image };
  return (
    <Drawer open wide onClose={onClose} title={f.id ? `Univers « ${value.word} »` : "Nouvel univers"} sub="Vitrine 3D de l'accueil public"
      footer={<>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-action" disabled={busy || wouldExceed} onClick={save}>{busy ? <span className="spinner" /> : "Enregistrer"}</button>
      </>}>
      <div className="slide-editor">
        <div className="stack">
          <div className="form-grid">
            <Field label="Mot géant" hint="Onglet et grand mot en fond. 14 caractères au plus.">
              <input className="input" maxLength={14} value={f.word} onChange={set("word")} placeholder="Papier" autoFocus />
            </Field>
            <Field label="Catégorie ouverte par le bouton" hint="« Voir ces produits » mène à cette catégorie">
              <select className="select" value={f.category} onChange={set("category")}>
                <option value="">Tout le catalogue</option>
                {categories.filter((c) => !c.parent).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Titre" className="span-2" hint={`${f.title.length}/90`}>
              <input className="input" maxLength={90} value={f.title} onChange={set("title")} placeholder="Mouchoirs, papier toilette, serviettes." />
            </Field>
            <Field label="Texte d'accroche" className="span-2" hint={`${f.text.length}/220`}>
              <textarea className="textarea" maxLength={220} rows={2} value={f.text} onChange={set("text")} />
            </Field>
          </div>

          <div className="field">
            <span className="field-label">Couleur de l'univers</span>
            <div className="row wrap" style={{ gap: 8 }}>
              <div className="swatches">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" className={f.color.toUpperCase() === c ? "active" : ""} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />
                ))}
              </div>
              <input type="color" className="color-pick" value={f.color} onChange={set("color")} aria-label="Autre couleur" />
            </div>
            {contrast < 3 && <span className="photo-error">Couleur trop claire : le texte blanc sera difficile à lire. Choisissez une teinte plus soutenue.</span>}
          </div>

          <div className="field">
            <span className="field-label">Objet en 3D</span>
            <div className="model-grid" role="radiogroup" aria-label="Objet en 3D">
              {MODELS.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={f.model === m.key} className={f.model === m.key ? "active" : ""}
                  onClick={() => setF({ ...f, model: m.key })} style={{ "--bg": f.color }}>
                  <span className="model-icon">{m.visual ? <ProductArt visual={m.visual} accent={f.color} size={34} bg={false} /> : <ImagePlus size={24} />}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {f.model === "photo" ? (
            <PhotoField image={shown.image} cutout accent={f.color} visual="pack" busy={busy}
              rules={{ minSide: 300, minHeight: 900, requireCutout: true }} tips={SHOWCASE_TIPS} label="Photo détourée du produit"
              onFile={(fl, info) => { setFile(fl); setPreview(info.url); }} />
          ) : (
            <div className="form-grid">
              <Field label="Texte de l'étiquette 3D" hint="Imprimé sur l'objet, à côté du logo gocelsys">
                <input className="input" maxLength={24} value={f.label_title} onChange={set("label_title")} placeholder="Mouchoirs doux" />
              </Field>
              <Field label="Sous-texte" hint="Contenance, format…">
                <input className="input" maxLength={24} value={f.label_sub} onChange={set("label_sub")} placeholder="100 feuilles · 3 plis" />
              </Field>
            </div>
          )}

          <label className="check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Visible sur le site</label>
          {wouldExceed && <div className="callout warn">{MAX_ACTIVE} univers sont déjà visibles : masquez-en un pour afficher celui-ci.</div>}
        </div>
        <aside className="slide-preview">
          <span className="xs faint">Aperçu</span>
          <SlidePoster slide={shown} />
          <span className="xs faint">Sur le site, l'objet tourne en 3D et les univers se succèdent au défilement.</span>
        </aside>
      </div>
    </Drawer>
  );
}

function Showcase() {
  const toast = useToast();
  const qc = useQueryClient();
  const list = useList("/site/showcase/");
  const [editing, setEditing] = useState(null);
  const slides = list.rows;
  const active = slides.filter((s) => s.is_active).length;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/site/showcase/"] });
    qc.invalidateQueries({ queryKey: ["public-home"] });
  };
  const move = async (i, dir) => {
    const order = slides.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await post("/site/showcase/reorder/", { order });
    refresh();
  };
  const toggle = async (s) => {
    try {
      await api.patch(`/site/showcase/${s.id}/`, { is_active: !s.is_active });
      toast.success(s.is_active ? `« ${s.word} » est masqué du site.` : `« ${s.word} » est visible sur le site.`);
      refresh();
    } catch (e) {
      toast.error(e);
    }
  };
  const remove = async (s) => {
    if (!window.confirm(`Supprimer l'univers « ${s.word} » de la vitrine ?`)) return;
    try {
      await del(`/site/showcase/${s.id}/`);
      toast.success("Univers supprimé.");
      refresh();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Vitrine 3D</h3>
          <p className="sub">{active}/{MAX_ACTIVE} univers visibles. L'ordre ci-dessous est l'ordre de défilement sur l'accueil.</p>
        </div>
        <button className="btn btn-action" onClick={() => setEditing({})} disabled={slides.length >= 12}><Plus /> Nouvel univers</button>
      </div>
      {list.isLoading ? <LoadingRows /> : slides.length === 0 ? <Empty title="Aucun univers" /> : (
        <div className="slide-grid">
          {slides.map((s, i) => (
            <article key={s.id} className={`slide-card ${s.is_active ? "" : "off"}`}>
              <button className="slide-card-poster" onClick={() => setEditing(s)} aria-label={`Modifier ${s.word}`}>
                <SlidePoster slide={s} compact />
              </button>
              <div className="slide-card-foot">
                <div className="grow">
                  <div className="strong">{i + 1}. {s.word} {!s.is_active && <Pill plain>masqué</Pill>}</div>
                  <div className="xs faint">{s.model_label}{s.category_name ? ` · ${s.category_name}` : ""}</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Avancer"><ArrowLeft /></button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label="Reculer"><ArrowRight /></button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggle(s)} aria-label={s.is_active ? "Masquer" : "Afficher"} title={s.is_active ? "Masquer du site" : "Afficher sur le site"}>
                  {s.is_active ? <Eye /> : <EyeOff />}
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(s)} aria-label="Modifier"><Pencil /></button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(s)} aria-label="Supprimer"><Trash2 /></button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <SlideDrawer value={editing} activeCount={active} onClose={() => setEditing(null)} />}
    </section>
  );
}

function Featured() {
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["site-featured"], queryFn: () => get("/site/showcase/featured/") });
  const products = useMemo(() => (data?.products || [])
    .filter((p) => !onlyFeatured || p.is_featured)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())), [data, search, onlyFeatured]);
  const count = (data?.products || []).filter((p) => p.is_featured).length;
  const toggle = async (p) => {
    try {
      const r = await post("/site/showcase/featured/", { product: p.id, featured: !p.is_featured });
      qc.setQueryData(["site-featured"], r);
      qc.invalidateQueries({ queryKey: ["public-home"] });
      qc.invalidateQueries({ queryKey: ["/products/"] });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Produits mis en avant</h3>
          <p className="sub">{count}/{data?.max || 12} produits dans « Les incontournables du moment ». Touchez l'étoile pour ajouter ou retirer.</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="input-group"><Search /><input className="input" placeholder="Chercher un produit" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <label className="check"><input type="checkbox" checked={onlyFeatured} onChange={(e) => setOnlyFeatured(e.target.checked)} /> Seulement les produits mis en avant</label>
      </div>
      {isLoading ? <LoadingRows /> : (
        <div className="feat-grid">
          {products.map((p) => (
            <button key={p.id} className={`feat-card ${p.is_featured ? "on" : ""}`} onClick={() => toggle(p)} aria-pressed={p.is_featured}>
              <span className="feat-art" style={{ "--c": p.accent || "#6450FF" }}><ProductVisual product={p} size={64} /></span>
              <span className="feat-text">
                <strong>{p.name}</strong>
                <span className="xs faint">{p.category_name}{!p.sold_online ? " · hors site" : ""}{!p.image ? " · sans photo" : ""}</span>
              </span>
              <Star className="feat-star" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function SitePublic() {
  const [tab, setTab] = useState("vitrine");
  return (
    <>
      <PageHead title="Site public" lead="Ce que voient les visiteurs sur l'accueil : les univers de la vitrine 3D et les produits mis en avant. Chaque changement est visible immédiatement."
        actions={<a className="btn" href="/" target="_blank" rel="noreferrer"><ExternalLink /> Voir le site</a>} />
      <Tabs tabs={[{ value: "vitrine", label: "Vitrine 3D" }, { value: "produits", label: "Produits mis en avant" }]} value={tab} onChange={setTab} />
      {tab === "vitrine" ? <Showcase /> : <Featured />}
    </>
  );
}
