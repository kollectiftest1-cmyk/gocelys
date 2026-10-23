import { useQuery } from "@tanstack/react-query";
import { Search, Star, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { get } from "../api/client";
import { Avatar, Drawer, Empty, LoadingRows, PageHead, Pager, Pill, StatusPill } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { date, money, num } from "../lib/format";
import { ORDER_STATUS } from "../lib/status";

function CustomerDrawer({ customer, onClose }) {
  const { data } = useQuery({ queryKey: ["cust-orders", customer?.id], queryFn: () => get("/orders/", { customer: customer.id, page_size: 10 }), enabled: Boolean(customer) });
  if (!customer) return null;
  return (
    <Drawer open onClose={onClose} title={customer.name} sub={customer.phone}>
      <div className="stack">
        <dl className="kv">
          <dt>Compte application</dt><dd>{customer.has_account ? <Pill tone="sky">Oui</Pill> : <Pill>Non</Pill>}</dd>
          <dt>Agence préférée</dt><dd>{customer.preferred_agency_name || "—"}</dd>
          <dt>Points fidélité</dt><dd className="num">{num(customer.loyalty_points)}</dd>
          <dt>Commandes</dt><dd>{customer.orders_count}</dd>
          <dt>Total commandé</dt><dd className="num">{money(customer.total_spent)}</dd>
          <dt>Client depuis</dt><dd>{date(customer.created_at, { year: true })}</dd>
        </dl>
        {customer.addresses.length > 0 && (
          <div className="stack-sm">
            <h3 style={{ fontSize: "var(--fs-md)" }}>Adresses</h3>
            {customer.addresses.map((a) => <div key={a.id} className="small"><strong>{a.label}</strong> — {a.line}{a.landmark ? `, ${a.landmark}` : ""} <span className="faint">{a.zone_name}</span></div>)}
          </div>
        )}
        <div className="stack-sm">
          <h3 style={{ fontSize: "var(--fs-md)" }}>Dernières commandes</h3>
          {(data?.results || []).map((o) => (
            <Link key={o.id} to={`/commandes/${o.id}`} className="row-between small" style={{ color: "var(--text)" }}>
              <span>{o.reference} <span className="faint">· {date(o.created_at)}</span></span>
              <span className="row"><StatusPill map={ORDER_STATUS} value={o.status} /><span className="num strong">{money(o.total)}</span></span>
            </Link>
          ))}
          {data?.results?.length === 0 && <p className="small muted">Aucune commande.</p>}
        </div>
      </div>
    </Drawer>
  );
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const q = useDebounced(search);
  const list = useList("/customers/", { search: q, ordering: "-created_at" });
  return (
    <>
      <PageHead title="Clients" lead="Clients de l'application et clients enregistrés par téléphone, avec leur historique et leurs points de fidélité." />
      <section className="panel">
        <div className="toolbar">
          <div className="input-group">
            <Search />
            <input className="input" placeholder="Nom, téléphone, e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={Users} title="Aucun client" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Client</th><th>Agence préférée</th><th className="num">Commandes</th><th className="num">Total commandé</th><th className="num">Fidélité</th><th>Application</th></tr></thead>
              <tbody>
                {list.rows.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                    <td><div className="row"><Avatar name={c.name} /><div><div className="cell-main">{c.name}</div><div className="cell-sub">{c.phone}</div></div></div></td>
                    <td className="small">{c.preferred_agency_name || "—"}</td>
                    <td className="num">{c.orders_count}</td>
                    <td className="num">{money(c.total_spent)}</td>
                    <td className="num"><span className="row" style={{ gap: 4, justifyContent: "flex-end" }}><Star size={13} color="var(--coral-500)" /> {num(c.loyalty_points)}</span></td>
                    <td>{c.has_account ? <Pill tone="sky" plain>Compte actif</Pill> : <Pill plain>Sans compte</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      <CustomerDrawer customer={open} onClose={() => setOpen(null)} />
    </>
  );
}
