import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, LogOut, MapPin, Phone, ReceiptText, RotateCcw, Star, Store, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { del, get, post } from "../api/client";
import { Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { datetime, money, num, time } from "../lib/format";
import { useToast } from "../lib/toast";
import { AddressForm } from "./Cart";
import { useShop } from "./boutique-store";
import "./shop.css";
import "./account.css";

export const ORDER_LABEL = {
  confirmed: ["Reçue", "coral"], accepted: ["Acceptée", "brand"], preparing: ["En préparation", "sky"], ready: ["Prête", "leaf"],
  driver_assigned: ["Livreur en route", "sky"], in_delivery: ["En livraison", "sky"], delivered: ["Livrée", "leaf"],
  completed: ["Terminée", "leaf"], cancelled: ["Annulée", ""], refused: ["Refusée", "clay"], failed: ["Livraison échouée", "clay"],
  refunded: ["Remboursée", "amber"],
};
const DONE = ["completed", "cancelled", "refused", "refunded"];

function StatusTag({ status }) {
  const [label, tone] = ORDER_LABEL[status] || [status, ""];
  return <span className={`pill ${tone ? `pill-${tone}` : ""}`}>{label}</span>;
}

export function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const shop = useShop();
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => get("/shop/profile/") });
  const { data: orders, isLoading } = useQuery({ queryKey: ["my-orders"], queryFn: () => get("/shop/orders/", { page_size: 50 }), refetchInterval: 30000 });
  const { data: addresses = [], refetch } = useQuery({ queryKey: ["my-addresses"], queryFn: () => get("/shop/addresses/") });
  const [adding, setAdding] = useState(false);
  const rows = orders?.results || [];
  const open = rows.filter((o) => !DONE.includes(o.status));
  const past = rows.filter((o) => DONE.includes(o.status));

  return (
    <div className="pub-page account">
      <div className="acc-head">
        <div>
          <h1>Bonjour {profile?.name || user?.first_name}</h1>
          <p className="pub-lead">{user?.phone} · agence {shop.agency?.name}</p>
        </div>
        <div className="acc-points">
          <Star size={26} />
          <div><span>Points fidélité</span><strong>{num(profile?.loyalty_points || 0)}</strong></div>
        </div>
      </div>
      <div className="acc-grid">
        <div>
          <section className="ck-block">
            <h2>Commandes en cours</h2>
            {isLoading ? <Skeleton h={90} /> : open.length === 0 ? (
              <p className="muted">Aucune commande en cours. <Link to="/boutique">Commander</Link></p>
            ) : open.map((o) => <OrderRow key={o.id} o={o} />)}
          </section>
          <section className="ck-block">
            <h2>Historique</h2>
            {past.length === 0 ? <p className="muted">Vos commandes terminées apparaîtront ici.</p> : past.map((o) => <OrderRow key={o.id} o={o} />)}
          </section>
        </div>
        <aside>
          <section className="ck-block">
            <div className="row-between"><h2>Mes adresses</h2>{!adding && <button className="link-btn" onClick={() => setAdding(true)}>+ Ajouter</button>}</div>
            {addresses.map((a) => (
              <div key={a.id} className="acc-addr">
                <MapPin size={16} />
                <div className="grow"><strong>{a.label}</strong><div className="xs faint">{a.line}{a.zone_name ? ` · ${a.zone_name}` : ""}</div></div>
                <button className="ck-remove" aria-label="Supprimer" onClick={async () => { await del(`/shop/addresses/${a.id}/`); refetch(); toast.success("Adresse supprimée."); }}><Trash2 size={15} /></button>
              </div>
            ))}
            {(adding || !addresses.length) && <AddressForm zones={shop.zones} onCancel={addresses.length ? () => setAdding(false) : null} onSaved={() => { setAdding(false); refetch(); }} />}
          </section>
          <section className="ck-block">
            <h2>Mon compte</h2>
            <p className="small muted">{profile?.orders_count || 0} commande(s) · {money(profile?.total_spent || 0)} au total</p>
            <button className="pub-btn outline" onClick={async () => { await logout(); navigate("/"); }}><LogOut size={16} /> Se déconnecter</button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function OrderRow({ o }) {
  return (
    <Link to={`/mon-compte/commandes/${o.id}`} className="acc-order">
      <div className="acc-order-arts">
        {o.lines.slice(0, 3).map((l) => <span key={l.id} className="acc-dot" />)}
      </div>
      <div className="grow">
        <div className="row" style={{ gap: 8 }}><strong>{o.reference}</strong><StatusTag status={o.status} /></div>
        <div className="xs faint truncate">{o.lines.map((l) => l.label).join(", ")}</div>
        <div className="xs faint">{datetime(o.created_at)} · {o.fulfillment === "pickup" ? "Retrait" : "Livraison"} · {o.agency_name}</div>
      </div>
      <strong>{money(o.total)}</strong>
      <ChevronRight size={18} className="faint" />
    </Link>
  );
}

const STEPS_DELIVERY = [["confirmed", "Commande reçue"], ["accepted", "Acceptée"], ["preparing", "En préparation"], ["in_delivery", "En route"], ["completed", "Livrée"]];
const STEPS_PICKUP = [["confirmed", "Commande reçue"], ["accepted", "Acceptée"], ["preparing", "En préparation"], ["ready", "Prête à retirer"], ["completed", "Retirée"]];
const IDX_D = { confirmed: 0, accepted: 1, preparing: 2, ready: 2, driver_assigned: 3, in_delivery: 3, delivered: 4, completed: 4 };
const IDX_P = { confirmed: 0, accepted: 1, preparing: 2, ready: 3, completed: 4 };

export function OrderTracking() {
  const { id } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const shop = useShop();
  const navigate = useNavigate();
  const { data: o, refetch } = useQuery({ queryKey: ["my-order", id], queryFn: () => get(`/shop/orders/${id}/`), refetchInterval: 15000 });
  if (!o) return <div className="pub-page"><Skeleton h={420} style={{ borderRadius: 24 }} /></div>;
  const pickup = o.fulfillment === "pickup";
  const steps = pickup ? STEPS_PICKUP : STEPS_DELIVERY;
  const idx = (pickup ? IDX_P : IDX_D)[o.status] ?? -1;
  const stopped = ["cancelled", "refused", "failed", "refunded"].includes(o.status);
  const otp = o.delivery?.otp_code;

  const act = async (path, body, msg) => {
    try {
      await post(path, body);
      toast.success(msg);
      refetch();
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    } catch (e) {
      toast.error(e);
    }
  };
  const reorder = async () => {
    const lines = await post("/shop/orders/reorder/", { order: o.id });
    const catalog = await get("/shop/catalog/", { agency: shop.agencyId });
    const next = [];
    for (const l of lines) {
      const p = catalog.find((x) => x.id === l.product);
      const u = p?.units.find((x) => x.id === l.product_unit) || p?.units[0];
      if (p && u) next.push({ product: p.id, unit: u.id, name: p.name, unitName: u.unit, factor: Number(u.factor), price: Number(u.current_price), accent: p.accent, visual: p.visual, quantity: Number(l.quantity) });
    }
    shop.replace(next);
    navigate("/panier");
  };

  return (
    <div className="pub-page">
      <nav className="crumbs"><Link to="/mon-compte">Mon compte</Link> <span>/</span> <span>{o.reference}</span></nav>
      <div className="track-head">
        <div>
          <h1>{o.reference}</h1>
          <p className="pub-lead">{o.agency_name} · {datetime(o.created_at)}</p>
        </div>
        <StatusTag status={o.status} />
      </div>
      <div className="acc-grid">
        <div>
          {!pickup && otp && !DONE.includes(o.status) && o.status !== "delivered" && (
            <div className="code-card">
              <span>Code de livraison à donner au livreur</span>
              <strong>{otp}</strong>
              <em>Ne le communiquez qu'une fois les produits reçus.</em>
            </div>
          )}
          {pickup && o.pickup_code && !DONE.includes(o.status) && (
            <div className={`code-card ${o.status === "ready" ? "ready" : ""}`}>
              <span>{o.status === "ready" ? "Votre commande vous attend !" : "Code de retrait"}</span>
              <strong>{o.pickup_code}</strong>
              <em>À présenter au comptoir de {o.agency_name}.</em>
            </div>
          )}
          <section className="ck-block">
            {stopped ? (
              <p className="err-text">{o.status === "failed" ? "La livraison n'a pas pu aboutir : l'agence va vous rappeler." : `Commande ${ORDER_LABEL[o.status][0].toLowerCase()}.`}</p>
            ) : (
              <ol className="track">
                {steps.map(([k, label], i) => (
                  <li key={k} className={i < idx ? "done" : i === idx ? "current" : ""}>
                    <span>{i < idx ? <Check size={14} /> : null}</span>
                    <div>
                      <strong>{label}</strong>
                      {i === idx && o.history.length > 0 && <em>depuis {time(o.history[o.history.length - 1].at)}</em>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {o.delivery?.driver_name && (
              <div className="driver-line">
                <Truck size={20} />
                <div className="grow"><strong>{o.delivery.driver_name}</strong><div className="xs faint">Votre livreur</div></div>
                {o.delivery.driver_phone && <a className="pub-btn outline" href={`tel:${o.delivery.driver_phone}`}><Phone size={16} /> Appeler</a>}
              </div>
            )}
          </section>
          {o.status === "completed" && (
            <section className="ck-block rate">
              <strong>{o.rating ? "Merci pour votre avis !" : "Comment s'est passée cette commande ?"}</strong>
              <div>
                {[1, 2, 3, 4, 5].map((r) => (
                  <button key={r} onClick={() => act(`/shop/orders/${o.id}/rate/`, { rating: r }, "Merci !")} aria-label={`${r} étoile(s)`}>
                    <Star size={28} fill={(o.rating || 0) >= r ? "var(--coral-500)" : "none"} color="var(--coral-500)" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside>
          <section className="ck-block">
            <p className="row small muted" style={{ gap: 8 }}>{pickup ? <Store size={16} /> : <MapPin size={16} />} {pickup ? `Retrait à ${o.agency_name}` : o.address_text}</p>
            {o.lines.map((l) => (
              <div key={l.id} className="row-between small" style={{ padding: "6px 0" }}>
                <span>{num(l.quantity)} × {l.label}</span><span>{money(l.total)}</span>
              </div>
            ))}
            <div className="ck-sep" />
            {Number(o.discount) > 0 && <div className="row-between small ok-text"><span>Remise</span><span>−{money(o.discount)}</span></div>}
            {!pickup && <div className="row-between small"><span>Livraison</span><span>{money(o.delivery_fee)}</span></div>}
            <div className="row-between ck-grand"><span>Total</span><span>{money(o.total)}</span></div>
            <p className="xs faint">{o.payment_status === "paid" ? `Payée · ${o.payment_method_name}` : o.payment_status === "pending" ? `Paiement ${o.payment_method_name} en vérification` : "À payer en espèces"}</p>
          </section>
          <div className="stack-sm">
            {["confirmed", "accepted"].includes(o.status) && (
              <button className="pub-btn outline" onClick={() => window.confirm("Annuler cette commande ?") && act(`/shop/orders/${o.id}/cancel/`, { reason: "Annulée par le client" }, "Commande annulée.")}>Annuler la commande</button>
            )}
            {DONE.includes(o.status) && <button className="pub-btn primary" onClick={reorder}><RotateCcw size={16} /> Commander à nouveau</button>}
            <Link to="/mon-compte" className="pub-btn outline"><ReceiptText size={16} /> Toutes mes commandes</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
