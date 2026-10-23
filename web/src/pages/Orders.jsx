import { useQuery } from "@tanstack/react-query";
import { Clock, Columns3, List, MapPin, Phone, Search, ShoppingBag, Store, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { get } from "../api/client";
import { Empty, LoadingRows, PageHead, Pager, Pill, Segmented, StatusPill } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { useAuth } from "../lib/auth";
import { ago, money, num } from "../lib/format";
import { ORDER_STATUS } from "../lib/status";
import { useWorkspace } from "../lib/workspace";
import NewOrderDrawer from "./NewOrderDrawer";
import "./orders.css";

const COLUMNS = [
  ["confirmed", "Nouvelles"],
  ["accepted", "Acceptées"],
  ["preparing", "En préparation"],
  ["ready", "Prêtes"],
  ["driver_assigned", "Livreur affecté"],
  ["in_delivery", "En livraison"],
];

function OrderCard({ o }) {
  return (
    <Link to={`/commandes/${o.id}`} className={`order-card ${o.is_urgent ? "urgent" : ""}`}>
      <div className="row-between">
        <span className="ref">{o.reference.replace(/^CMD-/, "")}</span>
        <span className="xs faint row" style={{ gap: 4 }}>
          <Clock size={12} /> {ago(o.created_at)}
        </span>
      </div>
      <div className="strong">{o.customer_name}</div>
      <div className="xs muted row" style={{ gap: 6 }}>
        {o.fulfillment === "pickup" ? <Store size={13} /> : <MapPin size={13} />}
        <span className="truncate">{o.fulfillment === "pickup" ? `Retrait · ${o.agency_name}` : o.address_text || o.zone_name}</span>
      </div>
      <div className="row-between" style={{ marginTop: 4 }}>
        <span className="xs muted">{num(o.items_count)} article{o.items_count > 1 ? "s" : ""}</span>
        <span className="num strong">{money(o.total)}</span>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {o.is_urgent && <Pill tone="clay" plain><Zap size={11} /> Urgent</Pill>}
        {o.payment_status === "paid" ? <Pill tone="leaf" plain>Payée</Pill> : o.payment_status === "pending" ? <Pill tone="amber" plain>Paiement à confirmer</Pill> : <Pill plain>À encaisser</Pill>}
        {o.delivery?.driver_name && <Pill plain>{o.delivery.driver_name}</Pill>}
      </div>
    </Link>
  );
}

function Board() {
  const { params } = useWorkspace();
  const { data, isLoading } = useQuery({ queryKey: ["orders-board", params], queryFn: () => get("/orders/board/", params), refetchInterval: 30000 });
  if (isLoading) return <LoadingRows />;
  return (
    <div className="board">
      {COLUMNS.map(([key, label]) => {
        const items = data?.[key] || [];
        return (
          <section key={key} className={`board-col col-${key}`}>
            <header>
              <span>{label}</span>
              <span className="count">{items.length}</span>
            </header>
            <div className="board-items">
              {items.length === 0 ? <p className="xs faint" style={{ padding: "8px 4px" }}>Aucune commande</p> : items.map((o) => <OrderCard key={o.id} o={o} />)}
            </div>
          </section>
        );
      })}
      {data?.failed?.length > 0 && (
        <section className="board-col col-failed">
          <header>
            <span>Échouées</span>
            <span className="count">{data.failed.length}</span>
          </header>
          <div className="board-items">{data.failed.map((o) => <OrderCard key={o.id} o={o} />)}</div>
        </section>
      )}
    </div>
  );
}

function ListView() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { params } = useWorkspace();
  const [search, setSearch] = useState(sp.get("search") || "");
  const [status, setStatus] = useState("");
  const [fulfillment, setFulfillment] = useState("");
  const q = useDebounced(search);
  const list = useList("/orders/", { ...params, search: q, status, fulfillment });
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="input-group">
          <Search />
          <input className="input" placeholder="Référence, client, téléphone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(ORDER_STATUS).filter(([k]) => k !== "draft").map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="select" value={fulfillment} onChange={(e) => setFulfillment(e.target.value)}>
          <option value="">Livraison et retrait</option>
          <option value="delivery">Livraison</option>
          <option value="pickup">Retrait en agence</option>
        </select>
      </div>
      {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? (
        <Empty icon={ShoppingBag} title="Aucune commande">Modifiez les filtres ou attendez les prochaines commandes clients.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Commande</th>
                <th>Client</th>
                <th>Agence</th>
                <th>Mode</th>
                <th>Paiement</th>
                <th>Statut</th>
                <th className="num">Montant</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => navigate(`/commandes/${o.id}`)}>
                  <td>
                    <div className="cell-main">{o.reference}</div>
                    <div className="cell-sub">{ago(o.created_at)} · {o.channel}</div>
                  </td>
                  <td>
                    {o.customer_name}
                    <div className="cell-sub">{o.customer_phone}</div>
                  </td>
                  <td>{o.agency_name}</td>
                  <td className="muted">{o.fulfillment_label}</td>
                  <td className="small">{o.payment_status_label}<div className="cell-sub">{o.payment_method_name}</div></td>
                  <td><StatusPill map={ORDER_STATUS} value={o.status} /></td>
                  <td className="num strong">{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} count={list.count} onPage={list.setPage} />
    </section>
  );
}

export default function Orders() {
  const { can } = useAuth();
  const [sp] = useSearchParams();
  const [view, setView] = useState(sp.get("search") ? "list" : "board");
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHead
        title="Commandes"
        lead="Commandes reçues depuis l'application client, le téléphone ou WhatsApp, de la réception à la livraison."
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[
              { value: "board", label: <span className="row" style={{ gap: 6 }}><Columns3 size={14} /> Préparation</span> },
              { value: "list", label: <span className="row" style={{ gap: 6 }}><List size={14} /> Historique</span> },
            ]} />
            {can("orders.manage") && (
              <button className="btn btn-action" onClick={() => setCreating(true)}>
                <Phone /> Saisir une commande
              </button>
            )}
          </>
        }
      />
      {view === "board" ? <Board /> : <ListView />}
      <NewOrderDrawer open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
