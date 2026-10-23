import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, MapPin, Minus, Plus, ShoppingBag, Smartphone, Store, Trash2, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { get, post } from "../api/client";
import { Empty } from "../components/ui";
import { useAuth } from "../lib/auth";
import { money, num } from "../lib/format";
import { useToast } from "../lib/toast";
import ProductVisual from "./ProductVisual";
import { useShop } from "./boutique-store";
import "./shop.css";
import "./account.css";

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function Choice({ active, onClick, icon: Icon, title, text }) {
  return (
    <button type="button" className={`choice ${active ? "active" : ""}`} onClick={onClick} aria-pressed={active}>
      {Icon && <Icon size={20} />}
      <span>
        <strong>{title}</strong>
        {text && <em>{text}</em>}
      </span>
      {active && <Check size={18} className="choice-check" />}
    </button>
  );
}

export function AddressForm({ zones, onSaved, onCancel }) {
  const toast = useToast();
  const [f, setF] = useState({ label: "Domicile", line: "", landmark: "", zone: zones[0]?.id || "" });
  const save = async () => {
    if (!f.line.trim()) return toast.error("Indiquez l'avenue et le numéro.");
    try {
      const a = await post("/shop/addresses/", { ...f, zone: f.zone || null });
      toast.success("Adresse enregistrée.");
      onSaved(a);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="addr-form">
      <div className="addr-labels">
        {["Domicile", "Bureau", "Boutique"].map((l) => (
          <button key={l} type="button" className={f.label === l ? "active" : ""} onClick={() => setF({ ...f, label: l })}>{l}</button>
        ))}
      </div>
      <input className="input" placeholder="Avenue et numéro (ex. Av. Kinkanda 14)" value={f.line} onChange={(e) => setF({ ...f, line: e.target.value })} />
      <input className="input" placeholder="Point de repère (ex. en face de l'église)" value={f.landmark} onChange={(e) => setF({ ...f, landmark: e.target.value })} />
      {zones.length > 0 && (
        <select className="select" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} aria-label="Quartier">
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — livraison {money(z.fee)}</option>)}
        </select>
      )}
      <div className="row">
        <button type="button" className="pub-btn primary" onClick={save}>Enregistrer l'adresse</button>
        {onCancel && <button type="button" className="pub-btn outline" onClick={onCancel}>Annuler</button>}
      </div>
    </div>
  );
}

export default function Cart() {
  const shop = useShop();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const customer = isAuthenticated && user?.kind === "customer";
  const { data: addresses = [], refetch } = useQuery({ queryKey: ["my-addresses"], queryFn: () => get("/shop/addresses/"), enabled: customer });
  const [mode, setMode] = useState("delivery");
  const [address, setAddress] = useState(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState(null);
  const [reference, setReference] = useState("");
  const [promo, setPromo] = useState("");
  const [promoState, setPromoState] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!address && addresses.length) setAddress(addresses.find((a) => a.is_default)?.id || addresses[0].id);
  }, [addresses, address]);

  const addr = addresses.find((a) => a.id === address);
  const zone = shop.zones.find((z) => z.id === addr?.zone) || shop.zones.find((z) => z.name === addr?.zone_name);
  const fee = mode === "delivery" ? Number(zone?.fee || 0) : 0;
  const discount = promoState?.valid ? Number(promoState.discount) : 0;
  const total = shop.subtotal - discount + fee;
  const mm = method && method.kind !== "cash";

  const checkPromo = async () => {
    if (!promo.trim() || !customer) return;
    try {
      setPromoState(await post("/shop/promo/", { code: promo.trim(), amount: shop.subtotal }));
    } catch (e) {
      setPromoState({ valid: false, detail: e?.response?.data?.detail || "Code invalide." });
    }
  };

  const order = async () => {
    if (mode === "delivery" && !address) return toast.error("Ajoutez une adresse de livraison.");
    if (mm && !reference.trim()) return toast.error(`Saisissez la référence de votre paiement ${method.name}.`);
    setBusy(true);
    try {
      const o = await post("/shop/orders/", {
        client_uuid: uuid(), lines: shop.cart.map((l) => ({ product_unit: l.unit, quantity: l.quantity })),
        fulfillment: mode, agency: shop.agencyId, address: mode === "delivery" ? address : null,
        payment_method: method?.id || null, payment_reference: reference.trim(),
        promo_code: promoState?.valid ? promo.trim() : null, note,
      });
      shop.clear();
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      navigate(`/mon-compte/commandes/${o.id}`, { replace: true });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!shop.cart.length) {
    return (
      <div className="pub-page">
        <Empty icon={ShoppingBag} title="Votre panier est vide" action={<Link to="/boutique" className="pub-btn primary">Voir les produits</Link>}>
          Ajoutez de l'eau, du papier, des boissons ou vos produits de la maison.
        </Empty>
      </div>
    );
  }

  return (
    <div className="pub-page">
      <h1>Mon panier</h1>
      <p className="pub-lead">Commande préparée par <strong>{shop.agency?.name}</strong>. <Link to="/#agences">Changer d'agence</Link></p>
      <div className="checkout">
        <div className="checkout-main">
          <section className="ck-block">
            {shop.cart.map((l) => (
              <div key={l.unit} className="ck-line" style={{ "--c": l.accent || "#6450FF" }}>
                <span className="ck-art"><ProductVisual product={l} size={48} bg={false} /></span>
                <div className="grow">
                  <Link to={`/boutique/${l.product}`} className="strong">{l.name}</Link>
                  <div className="xs faint">{l.unitName}{l.factor > 1 ? ` de ${num(l.factor)}` : ""} · {money(l.price)}</div>
                </div>
                <div className="qty-pill small">
                  <button onClick={() => shop.setQty(l.unit, l.quantity - 1)} aria-label="Moins"><Minus size={14} /></button>
                  <span>{l.quantity}</span>
                  <button onClick={() => shop.setQty(l.unit, l.quantity + 1)} aria-label="Plus"><Plus size={14} /></button>
                </div>
                <strong className="ck-total">{money(l.price * l.quantity)}</strong>
                <button className="ck-remove" onClick={() => shop.setQty(l.unit, 0)} aria-label={`Retirer ${l.name}`}><Trash2 size={16} /></button>
              </div>
            ))}
          </section>

          {!customer ? (
            <section className="ck-block ck-login">
              <h2>Pour commander, connectez-vous</h2>
              <p>Votre panier est gardé. Créez un compte avec votre numéro de téléphone en moins d'une minute.</p>
              <div className="row wrap">
                <Link to="/connexion" state={{ from: "/panier" }} className="pub-btn primary">Se connecter</Link>
                <Link to="/inscription" state={{ from: "/panier" }} className="pub-btn outline">Créer un compte</Link>
              </div>
              {isAuthenticated && user?.kind === "staff" && <p className="xs faint">Vous êtes connecté avec un compte du personnel : les commandes en ligne se passent avec un compte client.</p>}
            </section>
          ) : (
            <>
              <section className="ck-block">
                <h2>Livraison ou retrait</h2>
                <div className="choices">
                  <Choice active={mode === "delivery"} onClick={() => setMode("delivery")} icon={Truck} title="Livraison à domicile"
                    text={zone ? `${zone.name} · environ ${zone.estimated_minutes} min · ${money(zone.fee)}` : "Frais selon votre quartier"} />
                  <Choice active={mode === "pickup"} onClick={() => setMode("pickup")} icon={Store} title="Retrait en agence" text={`Gratuit · ${shop.agency?.name || ""}`} />
                </div>
                {mode === "delivery" && (
                  <div className="ck-sub">
                    <div className="row-between"><h3>Adresse</h3>{!adding && <button className="link-btn" onClick={() => setAdding(true)}>+ Nouvelle adresse</button>}</div>
                    <div className="choices">
                      {addresses.map((a) => (
                        <Choice key={a.id} active={address === a.id} onClick={() => setAddress(a.id)} icon={MapPin} title={a.label} text={`${a.line}${a.landmark ? ` — ${a.landmark}` : ""}${a.zone_name ? ` · ${a.zone_name}` : ""}`} />
                      ))}
                    </div>
                    {(adding || addresses.length === 0) && (
                      <AddressForm zones={shop.zones} onCancel={addresses.length ? () => setAdding(false) : null}
                        onSaved={(a) => { setAdding(false); refetch(); setAddress(a.id); }} />
                    )}
                  </div>
                )}
              </section>

              <section className="ck-block">
                <h2>Paiement</h2>
                <div className="choices">
                  <Choice active={!method} onClick={() => setMethod(null)} icon={Banknote} title={`Espèces à la ${mode === "delivery" ? "livraison" : "remise"}`} text="Préparez si possible le montant exact" />
                  {shop.methods.filter((m) => m.kind !== "cash").map((m) => (
                    <Choice key={m.id} active={method?.id === m.id} onClick={() => setMethod(m)} icon={Smartphone} title={m.name} text="Payez maintenant puis saisissez la référence reçue par SMS" />
                  ))}
                </div>
                {mm && <input className="input ck-ref" placeholder={`Référence de la transaction ${method.name}`} value={reference} onChange={(e) => setReference(e.target.value)} />}
              </section>

              <section className="ck-block">
                <h2>Code promo et précisions</h2>
                <div className="row">
                  <input className="input" placeholder="BIENVENUE" value={promo} onChange={(e) => { setPromo(e.target.value.toUpperCase()); setPromoState(null); }} />
                  <button className="pub-btn outline" onClick={checkPromo}>Appliquer</button>
                </div>
                {promoState && <p className={promoState.valid ? "ok-text" : "err-text"}>{promoState.valid ? `${promoState.label} : −${money(promoState.discount)}` : promoState.detail}</p>}
                <textarea className="textarea" placeholder="Une précision pour l'agence ou le livreur ?" value={note} onChange={(e) => setNote(e.target.value)} />
              </section>
            </>
          )}
        </div>

        <aside className="ck-summary">
          <h2>Récapitulatif</h2>
          <div className="row-between"><span>Produits ({num(shop.count)})</span><span>{money(shop.subtotal)}</span></div>
          {discount > 0 && <div className="row-between ok-text"><span>Remise</span><span>−{money(discount)}</span></div>}
          {mode === "delivery" && <div className="row-between"><span>Livraison</span><span>{zone ? money(fee) : "selon le quartier"}</span></div>}
          <div className="row-between ck-grand"><span>Total</span><span>{money(total)}</span></div>
          <button className="pub-btn primary ck-order" disabled={!customer || busy} onClick={order}>{busy ? "Envoi…" : `Commander · ${money(total)}`}</button>
          <p className="xs faint">Les produits sont réservés dès la confirmation. Vous suivez la préparation et la livraison dans votre compte.</p>
        </aside>
      </div>
    </div>
  );
}
