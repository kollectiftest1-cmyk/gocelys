import { Bike, Search, Truck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Avatar, Empty, LoadingRows, PageHead, Pager, Pill, StatusPill, Tabs } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { useDrivers } from "../hooks/useRef";
import { ago, datetime, money } from "../lib/format";
import { DELIVERY_STATUS } from "../lib/status";
import { useWorkspace } from "../lib/workspace";

const VEHICLE = { moto: "Moto", tricycle: "Tricycle", van: "Camionnette", foot: "À pied" };

function Drivers() {
  const { agency } = useWorkspace();
  const drivers = useDrivers(agency);
  if (!drivers.length) return <Empty icon={Bike} title="Aucun livreur">Créez un utilisateur avec le rôle Livreur.</Empty>;
  return (
    <div className="grid-3">
      {drivers.map((d) => (
        <section key={d.id} className="panel panel-body" style={{ padding: 18 }}>
          <div className="row">
            <Avatar name={d.name} />
            <div className="grow">
              <div className="strong">{d.name}</div>
              <div className="xs faint">{d.agency_name} · {VEHICLE[d.vehicle]} {d.plate}</div>
            </div>
            {d.is_available ? <Pill tone="leaf">Disponible</Pill> : <Pill>Indisponible</Pill>}
          </div>
          <div className="row" style={{ marginTop: 14, gap: 24 }}>
            <div><div className="display-num" style={{ fontSize: "1.5rem", fontWeight: 600 }}>{d.active_deliveries}</div><div className="xs faint">en cours</div></div>
            <div><div className="display-num" style={{ fontSize: "1.5rem", fontWeight: 600 }}>{d.delivered_today}</div><div className="xs faint">livrées aujourd'hui</div></div>
            <div className="grow right xs faint">{d.last_seen_at ? `vu ${ago(d.last_seen_at)}` : ""}<div><a href={`tel:${d.phone}`}>{d.phone}</a></div></div>
          </div>
        </section>
      ))}
    </div>
  );
}

function List() {
  const { params } = useWorkspace();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const list = useList("/deliveries/", { ...params, status, search: q });
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="input-group">
          <Search />
          <input className="input" placeholder="Référence, commande, client" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(DELIVERY_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={Truck} title="Aucune livraison" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Livraison</th><th>Client · adresse</th><th>Livreur</th><th>Zone</th><th>Délai</th><th>Statut</th><th className="num">Montant</th></tr></thead>
            <tbody>
              {list.rows.map((d) => {
                const minutes = d.arrived_at && d.assigned_at ? Math.round((new Date(d.arrived_at) - new Date(d.assigned_at)) / 60000) : null;
                return (
                  <tr key={d.id}>
                    <td><Link to={`/commandes/${d.order}`} className="cell-main">{d.reference}</Link><div className="cell-sub">{d.order_reference} · {datetime(d.assigned_at)}</div></td>
                    <td className="small">{d.customer_name}<div className="cell-sub truncate" style={{ maxWidth: 260 }}>{d.address_text}</div></td>
                    <td className="small">{d.driver_name || "—"}</td>
                    <td className="small">{d.zone_name || "—"}<div className="cell-sub">{money(d.fee)}</div></td>
                    <td className="small">{minutes !== null ? `${minutes} min` : d.assigned_at ? ago(d.assigned_at) : "—"}</td>
                    <td><StatusPill map={DELIVERY_STATUS} value={d.status} />{d.proof_method && <div className="cell-sub">preuve : {d.proof_method}</div>}</td>
                    <td className="num strong">{money(d.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} count={list.count} onPage={list.setPage} />
    </section>
  );
}

export default function Deliveries() {
  const [tab, setTab] = useState("list");
  return (
    <>
      <PageHead title="Livraisons" lead="Affectation des livreurs, suivi des tournées et preuves de livraison (code OTP, photo, signature)." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "list", label: "Livraisons" }, { value: "drivers", label: "Livreurs" }]} />
      {tab === "list" ? <List /> : <Drivers />}
    </>
  );
}
