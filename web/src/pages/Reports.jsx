import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart2 } from "lucide-react";
import { useState } from "react";

import { download, get } from "../api/client";
import { Empty, LoadingRows, PageHead, Segmented, Tabs } from "../components/ui";
import { isoDate, money, moneyShort, num } from "../lib/format";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";

const KINDS = [
  { value: "sales", label: "Ventes", groups: [["day", "Par jour"], ["agency", "Par agence"], ["product", "Par produit"], ["category", "Par catégorie"], ["user", "Par caissier"], ["method", "Par moyen de paiement"]] },
  { value: "finance", label: "Finances", groups: [["day", "Par jour"], ["agency", "Par agence"], ["category", "Par catégorie"], ["method", "Par moyen"]] },
  { value: "stock", label: "Stock", groups: [] },
  { value: "orders", label: "Commandes", groups: [] },
  { value: "deliveries", label: "Livraisons", groups: [] },
];

function Totals({ kind, t }) {
  const items = {
    sales: [["Ventes", num(t.count)], ["Montant", money(t.total)]],
    finance: [["Entrées", money(t.in)], ["Sorties", money(t.out)], ["Solde", money(t.balance)], ["Écarts de caisse", money(t.cash_gaps)], ["Sessions avec écart", t.sessions_with_gap]],
    stock: [["Mouvements", num(t.movements)], ["Pertes et casse", num(t.losses)], ["Écarts d'inventaire", num(t.inventory_gaps)], ["Transferts", t.transfers]],
    orders: [["Commandes", num(t.count)], ["Montant", money(t.total)], ["Terminées", t.delivered], ["Annulées / refusées", t.cancelled], ["En attente", t.waiting]],
    deliveries: [["Livraisons", t.count], ["Livrées", t.delivered], ["En cours", t.in_progress], ["Retardées", t.late], ["Échouées / annulées", t.cancelled], ["Délai moyen", t.average_minutes !== null ? `${t.average_minutes} min` : "—"]],
  }[kind];
  return (
    <div className="stock-summary" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(([l, v]) => <div key={l}><span>{l}</span><strong className="display-num">{v}</strong></div>)}
    </div>
  );
}

export default function Reports() {
  const toast = useToast();
  const { params } = useWorkspace();
  const [kind, setKind] = useState("sales");
  const [group, setGroup] = useState("day");
  const [since, setSince] = useState(isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [until, setUntil] = useState(isoDate());
  const cfg = KINDS.find((k) => k.value === kind);
  const query = { ...params, since, until, group };
  const { data, isLoading } = useQuery({ queryKey: ["report", kind, query], queryFn: () => get(`/reports/${kind}/`, query) });
  const rows = data?.rows || [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.total ?? r.in ?? r.count ?? r.quantity ?? 0)));

  const exportCsv = async () => {
    try {
      await download(`/reports/${kind}/`, { ...query, format_type: "csv" }, `gocelsys-${kind}-${since}-${until}.csv`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHead title="Rapports" lead="Filtrez par période et par agence (sélecteur en haut de page), puis exportez en CSV pour Excel."
        actions={<button className="btn" onClick={exportCsv}><Download /> Exporter en CSV</button>} />
      <Tabs value={kind} onChange={(k) => { setKind(k); setGroup("day"); }} tabs={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <input className="input" type="date" value={since} onChange={(e) => setSince(e.target.value)} style={{ width: 160 }} aria-label="Du" />
        <span className="muted">au</span>
        <input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} style={{ width: 160 }} aria-label="Au" />
        {cfg.groups.length > 0 && <Segmented value={group} onChange={setGroup} options={cfg.groups.map(([v, l]) => ({ value: v, label: l }))} />}
      </div>
      {isLoading || !data ? <LoadingRows /> : (
        <>
          <Totals kind={kind} t={data.totals} />
          <section className="panel">
            <div className="panel-head"><h3>{data.title}</h3><span className="xs faint">{rows.length} ligne(s)</span></div>
            {rows.length === 0 ? <Empty icon={FileBarChart2} title="Aucune donnée sur la période" /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{data.label}</th>
                      {kind === "sales" && <><th className="num">Ventes</th>{group !== "method" && <th className="num">Quantité</th>}<th className="num">Montant</th><th style={{ width: "26%" }} /></>}
                      {kind === "finance" && <><th className="num">Entrées</th><th className="num">Sorties</th><th className="num">Solde</th></>}
                      {kind === "stock" && <><th>Agence</th><th>Type</th><th className="num">Quantité</th><th className="num">Mouvements</th></>}
                      {kind === "orders" && <><th className="num">Commandes</th><th className="num">Montant</th><th style={{ width: "30%" }} /></>}
                      {kind === "deliveries" && <><th className="num">Livraisons</th><th className="num">Livrées</th><th className="num">Échouées</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="cell-main">{kind === "sales" && group === "day" ? new Date(r.key).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : r.key}</td>
                        {kind === "sales" && <><td className="num">{num(r.count)}</td>{group !== "method" && <td className="num">{num(r.quantity)}</td>}<td className="num strong">{money(r.total)}</td>
                          <td><div style={{ height: 8, borderRadius: 4, background: "var(--mist-100)" }}><div style={{ height: 8, borderRadius: 4, width: `${(r.total / max) * 100}%`, background: "var(--brand-500)" }} /></div></td></>}
                        {kind === "finance" && <><td className="num">{moneyShort(r.in)}</td><td className="num">{moneyShort(r.out)}</td><td className={`num strong ${r.balance < 0 ? "text-clay" : ""}`}>{money(r.balance)}</td></>}
                        {kind === "stock" && <><td className="small">{r.agency}</td><td className="small">{r.kind}</td><td className={`num ${r.quantity < 0 ? "text-clay" : ""}`}>{num(r.quantity)}</td><td className="num">{r.count}</td></>}
                        {kind === "orders" && <><td className="num">{r.count}</td><td className="num strong">{money(r.total)}</td>
                          <td><div style={{ height: 8, borderRadius: 4, background: "var(--mist-100)" }}><div style={{ height: 8, borderRadius: 4, width: `${(r.count / max) * 100}%`, background: "var(--sky-500)" }} /></div></td></>}
                        {kind === "deliveries" && <><td className="num">{r.count}</td><td className="num">{r.delivered}</td><td className="num">{r.failed}</td></>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
