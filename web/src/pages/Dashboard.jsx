import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, ChevronRight, Truck, WalletCards } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { get } from "../api/client";
import { Empty, Pill, Segmented, Skeleton, StatusPill } from "../components/ui";
import { WaterLevel } from "../components/WaterLevel";
import { useAuth } from "../lib/auth";
import { ago, dateLong, money, moneyShort, num, pct, qty, time } from "../lib/format";
import { ORDER_STATUS } from "../lib/status";
import { useWorkspace } from "../lib/workspace";
import "./dashboard.css";

const PERIODS = [
  { value: "today", label: "Aujourd'hui" },
  { value: "7d", label: "7 jours" },
  { value: "30d", label: "30 jours" },
  { value: "month", label: "Ce mois" },
];

const SERIES = { pos: { label: "Ventes POS", color: "#4B35E0" }, orders: { label: "Commandes livrées", color: "#22C3E6" } };

// Sur le fond encre du bandeau, le bleu fleuve est éclairci pour rester lisible.
const HERO_POS = "#8F80FF";

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="chart-tip">
      <div className="strong">{new Date(label).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row-between">
          <span className="row" style={{ gap: 6 }}>
            <i style={{ background: SERIES[p.dataKey].color }} />
            {SERIES[p.dataKey].label}
          </span>
          <span className="num">{money(p.value)}</span>
        </div>
      ))}
      <div className="row-between strong" style={{ borderTop: "1px solid var(--line)", paddingTop: 4, marginTop: 2 }}>
        <span>Total</span>
        <span className="num">{money(total)}</span>
      </div>
    </div>
  );
}

function Hero({ k, period }) {
  const trend = k.revenue_trend;
  const share = k.revenue ? (k.revenue_pos / k.revenue) * 100 : 0;
  const compare = { today: "hier", "7d": "les 7 jours précédents", "30d": "les 30 jours précédents", month: "la période précédente" }[period];
  return (
    <div className="hero">
      <div className="hero-revenue">
        <span className="hero-label">Chiffre d'affaires</span>
        <span className="hero-value display-num">
          {num(k.revenue)}
          <small>FC</small>
        </span>
        <div className="row wrap small" style={{ gap: 10 }}>
          {trend !== null && trend !== undefined && (
            <span className={`trend ${trend >= 0 ? "up" : "down"}`}>
              {trend >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
              {pct(trend)}
            </span>
          )}
          <span className="muted">par rapport à {compare}</span>
        </div>
        <div className="split" role="img" aria-label={`POS ${Math.round(share)} %, commandes ${Math.round(100 - share)} %`}>
          <span style={{ width: `${share}%`, background: HERO_POS }} />
          <span style={{ width: `${100 - share}%`, background: SERIES.orders.color }} />
        </div>
        <div className="row small" style={{ gap: 18 }}>
          <span className="legend-dot" style={{ "--c": HERO_POS }}>POS {moneyShort(k.revenue_pos)}</span>
          <span className="legend-dot" style={{ "--c": SERIES.orders.color }}>Commandes {moneyShort(k.revenue_orders)}</span>
        </div>
      </div>
      <div className="hero-stats">
        <Link to="/ventes" className="hero-stat">
          <span className="hero-label">Tickets POS</span>
          <strong className="display-num">{num(k.sales_count)}</strong>
          <span className="muted small">panier moyen {moneyShort(k.average_ticket)}</span>
        </Link>
        <Link to="/commandes" className="hero-stat">
          <span className="hero-label">Commandes à traiter</span>
          <strong className="display-num">{num(k.orders_open)}</strong>
          <span className="small">
            {k.orders_urgent > 0 ? <span className="text-clay">{k.orders_urgent} urgente{k.orders_urgent > 1 ? "s" : ""}</span> : <span className="muted">{k.orders_new} reçues sur la période</span>}
          </span>
        </Link>
        <Link to="/livraisons" className="hero-stat">
          <span className="hero-label">Livraisons</span>
          <strong className="display-num">{num(k.deliveries_done)}</strong>
          <span className="small">
            <span className="muted">{k.deliveries_in_progress} en cours</span>
            {k.deliveries_late > 0 && <span className="text-clay"> · {k.deliveries_late} en retard</span>}
          </span>
        </Link>
        <Link to="/caisses" className="hero-stat">
          <span className="hero-label">Caisses ouvertes</span>
          <strong className="display-num">{num(k.cash_open)}</strong>
          <span className="muted small">{k.agencies_active} agences actives sur {k.agencies_total}</span>
        </Link>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { params, agencyObj } = useWorkspace();
  const [period, setPeriod] = useState("today");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", period, params],
    queryFn: () => get("/dashboard/", { period, ...params }),
    refetchInterval: 60000,
  });
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="dash">
      <header className="page-head">
        <div>
          <div className="crumb">{dateLong(new Date())}</div>
          <h1>
            {hello}, {user?.first_name || user?.full_name}
          </h1>
          <p className="lead">{agencyObj ? `Activité de l'agence ${agencyObj.name}.` : "Activité consolidée de toutes vos agences."}</p>
        </div>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </header>

      {isLoading || !data ? (
        <div className="stack">
          <Skeleton h={220} style={{ borderRadius: 16 }} />
          <Skeleton h={320} style={{ borderRadius: 16 }} />
        </div>
      ) : (
        <>
          <Hero k={data.kpis} period={period} />

          <div className="watch-strip">
            <Link to="/stocks?state=low" className={`watch ${data.kpis.stock_out ? "bad" : data.kpis.stock_low ? "warn" : ""}`}>
              <span>Stock critique</span>
              <strong>{data.kpis.stock_out + data.kpis.stock_low}</strong>
              <em>{data.kpis.stock_out} rupture{data.kpis.stock_out > 1 ? "s" : ""}</em>
            </Link>
            <Link to="/finances/depenses" className="watch">
              <span>Dépenses de la période</span>
              <strong>{moneyShort(data.kpis.expenses)}</strong>
              <em>{data.kpis.expenses_pending ? `${data.kpis.expenses_pending} à valider` : "rien en attente"}</em>
            </Link>
            <Link to="/finances/echeances" className={`watch ${data.kpis.dues_overdue ? "bad" : ""}`}>
              <span>Charges à venir · 30 j</span>
              <strong>{moneyShort(data.kpis.dues_upcoming)}</strong>
              <em>{data.kpis.dues_overdue ? `${data.kpis.dues_overdue} échue${data.kpis.dues_overdue > 1 ? "s" : ""}` : "aucune en retard"}</em>
            </Link>
            <Link to="/agences" className="watch">
              <span>Agences actives</span>
              <strong>
                {data.kpis.agencies_active}
                <small>/{data.kpis.agencies_total}</small>
              </strong>
              <em>{data.kpis.cash_open} caisse{data.kpis.cash_open > 1 ? "s" : ""} ouverte{data.kpis.cash_open > 1 ? "s" : ""}</em>
            </Link>
          </div>

          <div className="grid-main-side">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Encaissements par jour</h3>
                  <div className="sub">Ventes POS et commandes livrées, en francs congolais</div>
                </div>
                <div className="row small" style={{ gap: 14 }}>
                  {Object.values(SERIES).map((s) => (
                    <span key={s.label} className="legend-dot" style={{ "--c": s.color }}>{s.label}</span>
                  ))}
                </div>
              </div>
              <div className="panel-body" style={{ height: 300, paddingLeft: 8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={SERIES.pos.color} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={SERIES.pos.color} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gOrd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={SERIES.orders.color} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={SERIES.orders.color} stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#ECECF4" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6E6E86" }} minTickGap={24}
                      tickFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} />
                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#6E6E86" }}
                      tickFormatter={(v) => moneyShort(v).replace(" FC", "")} />
                    <Tooltip content={<ChartTip />} cursor={{ stroke: "#14123A", strokeWidth: 1, strokeDasharray: "3 3" }} />
                    <Area type="monotone" dataKey="pos" stackId="1" stroke={SERIES.pos.color} strokeWidth={2} fill="url(#gPos)" />
                    <Area type="monotone" dataKey="orders" stackId="1" stroke={SERIES.orders.color} strokeWidth={2} fill="url(#gOrd)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>À traiter</h3>
                  <div className="sub">Alertes non lues</div>
                </div>
              </div>
              {data.alerts.length === 0 ? (
                <Empty icon={Bell} title="Tout est sous contrôle">Aucune alerte en attente.</Empty>
              ) : (
                <ul className="alert-list">
                  {data.alerts.map((a) => (
                    <li key={a.id} className={`lvl-${a.level}`}>
                      <AlertTriangle />
                      <div className="grow">
                        <Link to={a.link?.startsWith("/") ? a.link : "#"} className="strong small">{a.title}</Link>
                        <p className="xs muted">{a.body}</p>
                      </div>
                      <span className="xs faint nowrap">{ago(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid-3" style={{ marginTop: 20 }}>
            <section className="panel">
              <div className="panel-head">
                <h3>Ventes par agence</h3>
              </div>
              <div className="panel-body stack-sm">
                {data.by_agency.length === 0 && <p className="muted small">Aucune vente sur la période.</p>}
                {data.by_agency.map((a) => {
                  const max = data.by_agency[0]?.total || 1;
                  return (
                    <div key={a.id} className="agency-bar">
                      <div className="row-between small">
                        <span className="row" style={{ gap: 8 }}>
                          <span className="agency-dot" style={{ background: a.color }} />
                          {a.name}
                          {a.status !== "active" && <Pill plain>fermée</Pill>}
                        </span>
                        <span className="num strong">{moneyShort(a.total)}</span>
                      </div>
                      <div className="bar-track">
                        <span style={{ width: `${(a.total / max) * 100}%`, background: a.color || "#22C3E6" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Niveaux critiques</h3>
                  <div className="sub">Disponible face au seuil minimum</div>
                </div>
                <Link to="/stocks?state=low" className="btn btn-sm btn-ghost">Tout voir</Link>
              </div>
              {data.low_stock.length === 0 ? (
                <Empty title="Stocks au-dessus des seuils" />
              ) : (
                <ul className="level-list">
                  {data.low_stock.map((r, i) => (
                    <li key={i}>
                      <WaterLevel value={r.quantity} min={r.min} max={r.min * 3} height={38} width={18} />
                      <div className="grow">
                        <div className="small strong truncate">{r.product}</div>
                        <div className="xs faint">{r.agency}</div>
                      </div>
                      <div className="right">
                        <div className={`num small strong ${r.quantity <= 0 ? "text-clay" : ""}`}>{qty(r.quantity)}</div>
                        <div className="xs faint num">seuil {num(r.min)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>Produits les plus vendus</h3>
              </div>
              <div className="panel-body stack-sm">
                {data.top_products.length === 0 && <p className="muted small">Aucune vente sur la période.</p>}
                {data.top_products.map((p, i) => (
                  <div key={p.product} className="top-row">
                    <span className="rank">{i + 1}</span>
                    <div className="grow">
                      <div className="small truncate">{p.product}</div>
                      <div className="xs faint num">{num(p.quantity)} unités</div>
                    </div>
                    <span className="num small strong">{moneyShort(p.total)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid-main-side" style={{ marginTop: 20 }}>
            <section className="panel">
              <div className="panel-head">
                <h3>Dernières commandes</h3>
                <Link to="/commandes" className="btn btn-sm btn-ghost">
                  Tableau de préparation <ChevronRight />
                </Link>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Commande</th>
                      <th>Client</th>
                      <th>Mode</th>
                      <th>Statut</th>
                      <th className="num">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link to={`/commandes/${o.id}`} className="cell-main">{o.reference}</Link>
                          <div className="cell-sub">{ago(o.created_at)} · {o.agency}</div>
                        </td>
                        <td>
                          {o.customer}
                          {o.is_urgent && <> <Pill tone="clay" plain>Urgent</Pill></>}
                        </td>
                        <td className="muted">{o.fulfillment === "pickup" ? "Retrait" : "Livraison"}</td>
                        <td>
                          <StatusPill map={ORDER_STATUS} value={o.status} />
                        </td>
                        <td className="num strong">{money(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="stack">
              <section className="panel">
                <div className="panel-head">
                  <h3>Encaissé par moyen</h3>
                </div>
                <div className="panel-body stack-sm">
                  {data.payment_methods.map((m) => {
                    const total = data.payment_methods.reduce((s, x) => s + x.total, 0) || 1;
                    return (
                      <div key={m.method} className="row-between small">
                        <span>{m.method}</span>
                        <span className="row" style={{ gap: 10 }}>
                          <span className="faint xs num">{Math.round((m.total / total) * 100)} %</span>
                          <span className="num strong">{moneyShort(m.total)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h3>Caisses ouvertes</h3>
                  <WalletCards size={18} className="faint" />
                </div>
                <div className="panel-body stack-sm">
                  {data.open_sessions.length === 0 && <p className="muted small">Aucune caisse ouverte.</p>}
                  {data.open_sessions.map((s) => (
                    <Link key={s.id} to={`/caisses/${s.id}`} className="row-between small session-row">
                      <span>
                        <span className="strong">{s.pos}</span> · {s.agency}
                        <span className="xs faint" style={{ display: "block" }}>{s.cashier}</span>
                      </span>
                      <span className="xs faint">depuis {time(s.opened_at)}</span>
                    </Link>
                  ))}
                </div>
              </section>
              {data.kpis.deliveries_late > 0 && (
                <div className="callout warn">
                  <Truck />
                  <span>{data.kpis.deliveries_late} livraison(s) dépassent le délai prévu.</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
