import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Clock, MapPin, Phone, Plus, ShoppingBag, Store, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { get } from "../api/client";
import { money, num } from "../lib/format";
import { useToast } from "../lib/toast";
import ProductArt from "./ProductArt";
import ProductVisual from "./ProductVisual";
import { useCatalog, useShop } from "./boutique-store";
import "./landing.css";

// Univers de secours (même contenu que la démonstration) si l'API ne répond pas.
const DEFAULT_SLIDES = [
  { id: "eau", word: "Eau", title: "L'eau de toute la famille, du sachet à la fontaine.",
    text: "Sachets, bouteilles, bidons et bonbonnes de 19 litres, livrés à la maison comme au bureau.",
    color: "#0B8DB5", model: "bottle", label_title: "Eau minérale", label_sub: "1,5 L" },
  { id: "papier", word: "Papier", title: "Mouchoirs, papier toilette, serviettes.",
    text: "À la boîte, au paquet ou au carton : l'essentiel de l'hygiène toujours en stock dans votre agence.",
    color: "#4B35E0", model: "box", label_title: "Mouchoirs doux", label_sub: "100 feuilles · 3 plis" },
  { id: "boissons", word: "Boissons", title: "Jus et sodas, à l'unité ou au carton.",
    text: "Pour la maison, la boutique ou la fête : commandez le volume qu'il vous faut.",
    color: "#E5482B", model: "can", label_title: "Jus tropical", label_sub: "33 cl" },
  { id: "maison", word: "Maison", title: "Et tout le reste du panier.",
    text: "Savon, lessive, javel, riz, sucre, huile. Un seul fournisseur pour vos achats du quotidien.",
    color: "#0E8A55", model: "pump", label_title: "Savon liquide", label_sub: "500 ml" },
];

// forme 2D équivalente à chaque modèle 3D (affichage sans WebGL)
const MODEL_VISUAL = { bottle: "bottle", box: "box", can: "can", pump: "jar", photo: "pack" };

function darker(hex, k = 0.22) {
  const n = parseInt(hex.slice(1), 16);
  const c = [16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * (1 - k)).toString(16).padStart(2, "0"));
  return `#${c.join("")}`;
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * t)));
  return `rgb(${c.join(",")})`;
}

/* ------------------------------------------------------------------ vitrine 3D épinglée */
function Showcase({ slides }) {
  const STAGES = slides;
  const wrap = useRef(null);
  const canvas = useRef(null);
  const engine = useRef(null);
  const [progress, setProgress] = useState(0);
  const [fallback, setFallback] = useState(false);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    let disposed = false;
    let trigger = null;
    (async () => {
      const [{ createShowcase, webglAvailable }, gsapMod, stMod] = await Promise.all([
        import("./showcase3d"), import("gsap"), import("gsap/ScrollTrigger"),
      ]);
      // les étiquettes 3D sont dessinées avec la police du site : on attend qu'elle soit chargée
      await Promise.race([document.fonts?.load('800 60px "Plus Jakarta Sans Variable"'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
      if (disposed) return;
      if (!webglAvailable()) {
        setFallback(true);
      } else {
        engine.current = createShowcase(canvas.current, { reducedMotion: reduced, slides });
        const place = () => engine.current?.setOffset(window.innerWidth >= 980 ? 0.35 : 0);
        place();
        window.addEventListener("resize", place);
        engine.current._place = place;
      }
      const gsap = gsapMod.gsap || gsapMod.default;
      const ScrollTrigger = stMod.ScrollTrigger || stMod.default;
      gsap.registerPlugin(ScrollTrigger);
      const proxy = { p: 0 };
      trigger = ScrollTrigger.create({
        trigger: wrap.current,
        start: "top top",
        end: "bottom bottom",
        scrub: reduced ? true : 0.9,
        onUpdate: (self) => {
          gsap.to(proxy, {
            p: self.progress, duration: reduced ? 0 : 0.5, overwrite: true, ease: "power2.out",
            onUpdate: () => {
              engine.current?.setProgress(proxy.p);
              setProgress(proxy.p);
            },
          });
        },
      });
    })();
    return () => {
      disposed = true;
      trigger?.kill();
      if (engine.current?._place) window.removeEventListener("resize", engine.current._place);
      engine.current?.dispose();
      engine.current = null;
    };
  }, [reduced, slides]);

  const onPointer = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    engine.current?.setPointer(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  const f = progress * (STAGES.length - 1);
  const i = Math.min(STAGES.length - 1, Math.round(f));
  const a = STAGES[Math.floor(f)];
  const b = STAGES[Math.min(STAGES.length - 1, Math.floor(f) + 1)];
  // la couleur reste franche sur chaque univers et bascule vite au milieu du passage
  const raw = f - Math.floor(f);
  const e = Math.min(1, Math.max(0, (raw - 0.3) / 0.4));
  const t = e * e * (3 - 2 * e);
  const bg = mix(a.color, b.color, t);
  const deep = mix(darker(a.color), darker(b.color), t);
  const stage = STAGES[i];

  const jump = (k) => {
    const el = wrap.current;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (span * k) / Math.max(1, STAGES.length - 1) + 2, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <section ref={wrap} className="showcase" style={{ height: `${STAGES.length * 100 + 40}vh` }} aria-label="Nos univers de produits">
      <div className="showcase-sticky" style={{ "--bg": bg, "--deep": deep }} onPointerMove={onPointer}>
        <div className="showcase-word" aria-hidden="true">
          {STAGES.map((s, k) => (
            <span key={s.id} style={{ opacity: Math.max(0, 1 - Math.abs(f - k) * 2.6), transform: `translateY(${(k - f) * 60}%)` }}>{s.word}</span>
          ))}
        </div>
        <canvas ref={canvas} className="showcase-canvas" aria-hidden="true" />
        {fallback && (
          <div className="showcase-fallback" aria-hidden="true">
            {stage.model === "photo" && stage.image
              ? <img src={stage.image} alt="" className="showcase-photo" />
              : <ProductArt visual={MODEL_VISUAL[stage.model] || "pack"} accent="#ffffff" size={260} />}
          </div>
        )}
        <div className="showcase-copy">
          <h1 className="showcase-brand">Tout ce qui fait tourner la maison, livré par Gocelsys.</h1>
          <div className="showcase-stage" key={stage.id}>
            <h2>{stage.title}</h2>
            <p>{stage.text}</p>
          </div>
          <div className="showcase-cta">
            <Link to={stage.category ? `/boutique?categorie=${stage.category}` : "/boutique"} className="pub-btn light">
              <ShoppingBag size={18} /> {stage.category ? "Voir ces produits" : "Voir les produits"}
            </Link>
            <Link to="/#commander" className="pub-btn outline-light">Comment commander</Link>
          </div>
        </div>
        <nav className="showcase-index" aria-label="Univers">
          {STAGES.map((s, k) => (
            <button key={s.id} className={k === i ? "active" : ""} onClick={() => jump(k)}>
              <span>{s.word}</span>
              <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, 1 - Math.abs(f - k)))})` }} />
            </button>
          ))}
        </nav>
        <div className="showcase-hint" style={{ opacity: progress < 0.04 ? 1 : 0 }} aria-hidden="true">Faites défiler</div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ sélection */
function Selection() {
  const toast = useToast();
  const shop = useShop();
  const { data } = useCatalog({ featured: 1 });
  const track = useRef(null);
  const items = data || [];
  const scroll = (dir) => track.current?.scrollBy({ left: dir * Math.min(track.current.clientWidth * 0.8, 640), behavior: "smooth" });
  return (
    <section className="sel" id="selection">
      <div className="sel-head">
        <div>
          <h2>Les incontournables du moment</h2>
          <p>Prix et disponibilité de {shop.agency ? <strong>{shop.agency.name}</strong> : "votre agence"}.</p>
        </div>
        <div className="sel-arrows">
          <button onClick={() => scroll(-1)} aria-label="Produits précédents"><ArrowLeft /></button>
          <button onClick={() => scroll(1)} aria-label="Produits suivants"><ArrowRight /></button>
        </div>
      </div>
      <div className="sel-track" ref={track}>
        {items.map((p) => {
          const unit = p.units.find((u) => Number(u.factor) === 1) || p.units[0];
          const promo = Number(p.current_price) < Number(p.price);
          return (
            <article key={p.id} className="sel-card" style={{ "--c": p.accent || "#6450FF" }}>
              <Link to={`/boutique/${p.id}`} className="sel-art" aria-label={p.name}>
                <ProductVisual product={p} size={150} />
                {promo && <span className="sel-promo">Promo</span>}
              </Link>
              <div className="sel-body">
                <span className="sel-cat">{p.category_name}</span>
                <Link to={`/boutique/${p.id}`} className="sel-name">{p.name}</Link>
                <div className="sel-foot">
                  <div>
                    <strong>{money(p.current_price)}</strong>
                    {promo ? <s>{money(p.price)}</s> : <span>le {p.base_unit.toLowerCase()}</span>}
                  </div>
                  <button className="sel-add" disabled={!p.in_stock} aria-label={`Ajouter ${p.name} au panier`}
                    onClick={() => { shop.add(p, unit); toast.success(`${p.name} ajouté au panier.`); }}>
                    <Plus />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        <Link to="/boutique" className="sel-more">
          <span>Tout le catalogue</span>
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ étapes */
function Steps() {
  return (
    <section className="steps" id="commander">
      <h2>Commander prend deux minutes.</h2>
      <ol>
        <li>
          <span className="steps-n">1</span>
          <h3>Vous choisissez</h3>
          <p>Sur ce site, dans l'application Gocelsys ou par téléphone. Vous voyez le stock réel de votre agence.</p>
        </li>
        <li>
          <span className="steps-n">2</span>
          <h3>L'agence prépare</h3>
          <p>Vos produits sont réservés dès la confirmation : personne d'autre ne peut les acheter.</p>
        </li>
        <li>
          <span className="steps-n">3</span>
          <h3>Livré ou retiré</h3>
          <p>Le livreur vous remet la commande contre votre code à 4 chiffres, ou vous passez la retirer en agence.</p>
        </li>
      </ol>
      <div className="steps-modes">
        <div><Truck /> <span><strong>Livraison</strong> dans les quartiers desservis, frais affichés avant de payer.</span></div>
        <div><Store /> <span><strong>Retrait gratuit</strong> en agence, avec un code de retrait.</span></div>
        <div><ShoppingBag /> <span><strong>Paiement</strong> en espèces, M-Pesa, Orange Money ou Airtel Money.</span></div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ professionnels */
function Pros({ figures }) {
  return (
    <section className="pros" id="pros">
      <div className="pros-copy">
        <h2>Restaurants, bureaux, écoles, boutiques&nbsp;: on vous livre au carton.</h2>
        <p>Bonbonnes pour fontaines, cartons de bouteilles, papier en gros, produits d'entretien. Un compte, un historique de commandes, et une agence qui connaît vos besoins.</p>
        <Link to="/inscription" className="pub-btn light">Ouvrir un compte</Link>
      </div>
      {figures && (
        <dl className="pros-figures">
          <div><dt>Produits au catalogue</dt><dd>{num(figures.products)}</dd></div>
          <div><dt>Agences ouvertes</dt><dd>{num(figures.agencies)}</dd></div>
          <div><dt>Livraisons effectuées</dt><dd>{num(figures.deliveries)}</dd></div>
          <div><dt>Clients</dt><dd>{num(figures.customers)}</dd></div>
        </dl>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ agences */
const DAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
function Agencies({ agencies }) {
  const shop = useShop();
  const today = DAYS[new Date().getDay()];
  return (
    <section className="agencies-pub" id="agences">
      <div className="agencies-pub-head">
        <h2>Une agence près de chez vous</h2>
        <p>Choisissez la vôtre : les prix, le stock et les quartiers livrés sont ceux de cette agence.</p>
      </div>
      <div className="agencies-pub-list">
        {(agencies || []).map((a) => (
          <article key={a.id} className={shop.agencyId === a.id ? "current" : ""}>
            <h3>{a.name}</h3>
            <p className="ag-line"><MapPin size={15} /> {a.address}, {a.city}</p>
            {a.opening_hours?.[today] && <p className="ag-line"><Clock size={15} /> Aujourd'hui {a.opening_hours[today].replace("-", " – ")}</p>}
            {a.phone && <p className="ag-line"><Phone size={15} /> <a href={`tel:${a.phone}`}>{a.phone}</a></p>}
            {a.zones.length > 0 && <p className="ag-zones">Livre à {a.zones.join(", ")}</p>}
            {shop.agencyId === a.id ? <span className="ag-current">Votre agence</span> : (
              <button className="ag-choose" onClick={() => shop.setAgency(a.id)}>Choisir cette agence</button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Landing() {
  const { data, isError } = useQuery({ queryKey: ["public-home"], queryFn: () => get("/public/home/"), staleTime: 120000 });
  const slides = useMemo(() => {
    if (isError) return DEFAULT_SLIDES;
    if (!data) return null;
    return data.showcase?.length ? data.showcase : DEFAULT_SLIDES;
  }, [data, isError]);
  return (
    <>
      {slides ? <Showcase slides={slides} /> : <div className="showcase-wait" aria-hidden="true" />}
      <Selection />
      <Steps />
      <Pros figures={data?.figures} />
      <Agencies agencies={data?.agencies} />
    </>
  );
}
