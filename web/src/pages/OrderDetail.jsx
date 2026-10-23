import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, KeyRound, MapPin, Phone, Store, Truck, Zap } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { get, post } from "../api/client";
import { Field, Modal, PageHead, Panel, Pill, Skeleton, StatusPill } from "../components/ui";
import { useDrivers, usePaymentMethods } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { datetime, money, num, qty } from "../lib/format";
import { DELIVERY_STATUS, ORDER_ACTIONS, ORDER_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import "./orders.css";

const STEPS = [
  ["confirmed", "Reçue"],
  ["accepted", "Acceptée"],
  ["preparing", "Préparation"],
  ["ready", "Prête"],
  ["in_delivery", "En route"],
  ["completed", "Terminée"],
];
const ORDER_INDEX = { confirmed: 0, accepted: 1, preparing: 2, ready: 3, driver_assigned: 3, in_delivery: 4, delivered: 5, completed: 5 };

export default function OrderDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: o, isLoading } = useQuery({ queryKey: ["order", id], queryFn: () => get(`/orders/${id}/`) });
  const { data: check } = useQuery({ queryKey: ["order-stock", id], queryFn: () => get(`/orders/${id}/stock_check/`), enabled: Boolean(o) });
  const drivers = useDrivers(o?.agency, can("deliveries.manage") && Boolean(o) && o.fulfillment === "delivery");
  const methods = usePaymentMethods();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState("");
  const [driver, setDriver] = useState("");
  const [code, setCode] = useState("");
  const [pay, setPay] = useState({ open: false, method: "", reference: "" });

  const refresh = (data) => {
    qc.setQueryData(["order", id], data);
    qc.invalidateQueries({ queryKey: ["orders-board"] });
  };
  const act = async (fn, msg) => {
    setBusy(true);
    try {
      refresh(await fn());
      toast.success(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      setConfirm(null);
      setNote("");
    }
  };
  const transition = (status) => act(() => post(`/orders/${id}/transition/`, { status, note }), `Commande : ${ORDER_STATUS[status][0].toLowerCase()}.`);

  if (isLoading || !o) return <Skeleton h={400} style={{ borderRadius: 16 }} />;

  const step = ORDER_INDEX[o.status] ?? -1;
  const NEXT = { confirmed: "accepted", accepted: "preparing", preparing: "ready", failed: "ready", delivered: "completed" };
  const forward = NEXT[o.status] ? [NEXT[o.status]] : [];
  const danger = o.next_actions.filter((s) => ["cancelled", "refused"].includes(s));
  const isPickup = o.fulfillment === "pickup";

  return (
    <>
      <PageHead
        crumb={[{ label: "Commandes", to: "/commandes" }, { label: o.reference }]}
        title={
          <span className="row" style={{ gap: 12 }}>
            {o.reference}
            <StatusPill map={ORDER_STATUS} value={o.status} />
            {o.is_urgent && <Pill tone="clay"><Zap size={12} /> Urgent</Pill>}
          </span>
        }
        lead={`${o.fulfillment_label} · ${o.agency_name} · reçue le ${datetime(o.created_at)} via ${o.channel}`}
        actions={
          can("orders.manage") && (
            <>
              {danger.map((s) => (
                <button key={s} className="btn btn-danger" disabled={busy} onClick={() => setConfirm(s)}>{ORDER_ACTIONS[s]}</button>
              ))}
              {forward.map((s) => (
                <button key={s} className="btn btn-action" disabled={busy} onClick={() => transition(s)}>{ORDER_ACTIONS[s] || ORDER_STATUS[s][0]}</button>
              ))}
            </>
          )
        }
      />

      {!["cancelled", "refused", "failed", "refunded"].includes(o.status) && (
        <div className="progress-steps" style={{ marginBottom: 24 }}>
          {STEPS.map(([key, label], i) => (
            <div key={key} className={i < step ? "done" : i === step ? "done current" : ""}>{label}</div>
          ))}
        </div>
      )}

      <div className="grid-main-side">
        <div className="stack">
          <Panel title="Articles" sub={`${num(o.items_count)} article(s)`}>
            <table className="lines-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {o.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="strong">{l.label}</div>
                      <div className="xs faint">{num(l.quantity)} × {money(l.unit_price)}{Number(l.factor) > 1 ? ` · ${num(l.base_quantity)} unités de stock` : ""}</div>
                    </td>
                    <td className="num right strong">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="totals">
              <div className="row-between"><span className="muted">Sous-total</span><span className="num">{money(o.subtotal)}</span></div>
              {Number(o.discount) > 0 && <div className="row-between"><span className="muted">Remise</span><span className="num">− {money(o.discount)}</span></div>}
              {!isPickup && <div className="row-between"><span className="muted">Livraison {o.zone_name ? `(${o.zone_name})` : ""}</span><span className="num">{money(o.delivery_fee)}</span></div>}
              <div className="row-between grand"><span>Total</span><span className="num">{money(o.total)}</span></div>
            </div>
          </Panel>

          {check && ["confirmed", "accepted", "preparing"].includes(o.status) && (
            <Panel title="Stock de l'agence" sub="Quantités réservées pour cette commande">
              <div className="stack-sm">
                {check.map((c) => (
                  <div key={c.product} className="row-between small">
                    <span>{c.product}</span>
                    <span className="muted num">réservé {qty(c.base_quantity)} · disponible {qty(c.available)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Historique">
            <ul className="timeline">
              {o.history.map((h) => (
                <li key={h.id}>
                  <div className="strong small">{h.to_label}</div>
                  <div className="xs muted">{datetime(h.at)}{h.user_name ? ` · ${h.user_name}` : ""}</div>
                  {h.note && <div className="xs faint">{h.note}</div>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Client">
            <div className="stack-sm small">
              <strong style={{ fontSize: "var(--fs-md)" }}>{o.customer_name}</strong>
              <a href={`tel:${o.customer_phone}`} className="row" style={{ gap: 6 }}><Phone size={14} /> {o.customer_phone}</a>
              {isPickup ? (
                <span className="row muted" style={{ gap: 6 }}><Store size={14} /> Retrait à {o.agency_name}</span>
              ) : (
                <span className="row muted" style={{ gap: 6, alignItems: "flex-start" }}><MapPin size={14} style={{ marginTop: 3 }} /> {o.address_text}</span>
              )}
              {o.note && <div className="callout">{o.note}</div>}
            </div>
          </Panel>

          <Panel title="Paiement" actions={o.payment_status !== "paid" && can("orders.manage") && !["cancelled", "refused"].includes(o.status) && (
            <button className="btn btn-sm" onClick={() => setPay({ open: true, method: o.payment_method || "", reference: o.payment_reference })}><Banknote /> Encaisser</button>
          )}>
            <dl className="kv">
              <dt>Statut</dt>
              <dd>{o.payment_status === "paid" ? <Pill tone="leaf">Payée</Pill> : o.payment_status === "pending" ? <Pill tone="amber">À confirmer</Pill> : <Pill>Non payée</Pill>}</dd>
              <dt>Moyen</dt>
              <dd>{o.payment_method_name || "Espèces à la livraison"}</dd>
              {o.payment_reference && (<><dt>Référence</dt><dd className="code">{o.payment_reference}</dd></>)}
            </dl>
          </Panel>

          {isPickup ? (
            o.status === "ready" && can("orders.manage") && (
              <Panel title="Remise au client" sub="Le client présente son code de retrait">
                <div className="row">
                  <input className="input num" maxLength={6} placeholder="Code à 4 chiffres" value={code} onChange={(e) => setCode(e.target.value)} />
                  <button className="btn btn-action" disabled={busy || code.length < 4}
                    onClick={() => act(() => post(`/orders/${id}/pickup/`, { code }), "Commande remise au client.")}>
                    <KeyRound /> Valider
                  </button>
                </div>
              </Panel>
            )
          ) : (
            <Panel title="Livraison" actions={<Truck size={18} className="faint" />}>
              {o.delivery ? (
                <dl className="kv">
                  <dt>Livreur</dt>
                  <dd>{o.delivery.driver_name}</dd>
                  <dt>Statut</dt>
                  <dd><StatusPill map={DELIVERY_STATUS} value={o.delivery.status} /></dd>
                  <dt>Affectée</dt>
                  <dd>{datetime(o.delivery.assigned_at)}</dd>
                  {o.delivery.arrived_at && (<><dt>Livrée</dt><dd>{datetime(o.delivery.arrived_at)}</dd></>)}
                  {o.delivery.proof_method && (<><dt>Preuve</dt><dd>{{ otp: "Code OTP", photo: "Photo", signature: "Signature", driver: "Confirmation livreur" }[o.delivery.proof_method]}</dd></>)}
                </dl>
              ) : (
                <p className="small muted">Aucun livreur affecté.</p>
              )}
              {["ready", "driver_assigned", "failed"].includes(o.status) && can("deliveries.manage") && (
                <div className="row" style={{ marginTop: 14 }}>
                  <select className="select" value={driver} onChange={(e) => setDriver(e.target.value)}>
                    <option value="">Choisir un livreur…</option>
                    {drivers.filter((d) => d.is_active).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.is_available ? `${d.active_deliveries} en cours` : "indisponible"}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" disabled={!driver || busy}
                    onClick={() => act(() => post(`/orders/${id}/assign/`, { driver }), "Livreur affecté et prévenu.")}>
                    Affecter
                  </button>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm === "refused" ? "Refuser la commande" : "Annuler la commande"}
        footer={<>
          <button className="btn" onClick={() => setConfirm(null)}>Retour</button>
          <button className="btn btn-danger" disabled={busy || !note} onClick={() => transition(confirm)}>{ORDER_ACTIONS[confirm]}</button>
        </>}>
        <p className="small muted" style={{ marginBottom: 12 }}>Le stock réservé est libéré et le client est prévenu.</p>
        <Field label="Motif">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rupture, client injoignable, adresse hors zone…" autoFocus />
        </Field>
      </Modal>

      <Modal open={pay.open} onClose={() => setPay({ ...pay, open: false })} title={`Encaisser ${money(o.total)}`}
        footer={<>
          <button className="btn" onClick={() => setPay({ ...pay, open: false })}>Annuler</button>
          <button className="btn btn-action" disabled={busy || !pay.method}
            onClick={() => act(() => post(`/orders/${id}/paid/`, { method: pay.method, reference: pay.reference }), "Paiement enregistré.").then(() => setPay({ ...pay, open: false }))}>
            Enregistrer le paiement
          </button>
        </>}>
        <div className="stack">
          <Field label="Moyen de paiement">
            <select className="select" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              <option value="">Choisir…</option>
              {methods.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Référence de transaction" hint="Obligatoire pour Mobile Money et virement">
            <input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
