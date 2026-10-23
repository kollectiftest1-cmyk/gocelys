import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Info, Plus } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { get, post } from "../api/client";
import { Drawer, Empty, Field, LoadingRows, PageHead, Pager, Panel, Pill, Segmented, Skeleton } from "../components/ui";
import { useList } from "../hooks/useList";
import { useAgencies, useFinanceCategories, usePaymentMethods } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { datetime, isoDate, money, moneyShort } from "../lib/format";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";

const IN = "#1572A8";
const OUT = "#F25A3C";

function range(p) {
  const t = new Date();
  if (p === "month") return [isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), isoDate(t)];
  if (p === "prev") return [isoDate(new Date(t.getFullYear(), t.getMonth() - 1, 1)), isoDate(new Date(t.getFullYear(), t.getMonth(), 0))];
  if (p === "30d") return [isoDate(new Date(Date.now() - 29 * 86400000)), isoDate(t)];
  return [isoDate(new Date(t.getFullYear(), 0, 1)), isoDate(t)];
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>
      <strong>{new Date(label).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</strong>
      {payload.map((p) => <div key={p.dataKey} className="row-between" style={{ gap: 16 }}><span>{p.dataKey === "in" ? "Entrées" : "Sorties"}</span><span className="num">{money(p.value)}</span></div>)}
    </div>
  );
}

function ManualDrawer({ open, onClose }) {
  const agencies = useAgencies();
  const cats = useFinanceCategories();
  const methods = usePaymentMethods();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ direction: "in", agency: "", category: "", amount: "", currency: "CDF", method: "", label: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const save = async () => {
    try {
      await post("/finance/transactions/", { ...f, category: f.category || null, method: f.method || null });
      toast.success("Mouvement enregistré.");
      qc.invalidateQueries({ queryKey: ["treasury"] });
      qc.invalidateQueries({ queryKey: ["/finance/transactions/"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Autre entrée ou sortie" sub="Recette diverse, apport, retrait bancaire…"
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" onClick={save} disabled={!f.agency || !f.amount}>Enregistrer</button></>}>
      <div className="stack">
        <Segmented value={f.direction} onChange={set("direction")} options={[{ value: "in", label: "Entrée" }, { value: "out", label: "Sortie" }]} />
        <Field label="Agence"><select className="select" value={f.agency} onChange={set("agency")}><option value="">Choisir…</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Catégorie"><select className="select" value={f.category} onChange={set("category")}><option value="">—</option>{cats.filter((c) => c.direction === f.direction).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <div className="form-grid">
          <Field label="Montant"><input className="input num" type="number" value={f.amount} onChange={set("amount")} /></Field>
          <Field label="Devise"><select className="select" value={f.currency} onChange={set("currency")}><option>CDF</option><option>USD</option></select></Field>
        </div>
        <Field label="Moyen"><select className="select" value={f.method} onChange={set("method")}><option value="">—</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Libellé"><input className="input" value={f.label} onChange={set("label")} /></Field>
      </div>
    </Drawer>
  );
}

export default function Treasury() {
  const { can } = useAuth();
  const { params } = useWorkspace();
  const [p, setP] = useState("month");
  const [manual, setManual] = useState(false);
  const [since, until] = range(p);
  const { data: t, isLoading } = useQuery({ queryKey: ["treasury", params, since, until], queryFn: () => get("/finance/treasury/", { ...params, since, until }) });
  const list = useList("/finance/transactions/", { ...params, since, until });

  return (
    <>
      <PageHead title="Trésorerie" lead="Entrées et sorties d'argent enregistrées, consolidées en francs congolais au taux du jour."
        actions={<>
          <Segmented value={p} onChange={setP} options={[{ value: "month", label: "Ce mois" }, { value: "prev", label: "Mois dernier" }, { value: "30d", label: "30 jours" }, { value: "year", label: "Année" }]} />
          {can("finance.manage") && <button className="btn" onClick={() => setManual(true)}><Plus /> Autre mouvement</button>}
        </>} />
      {isLoading || !t ? <Skeleton h={300} /> : (
        <>
          <div className="treasury-band">
            <div>
              <span>Solde de la période</span>
              <strong className={`display-num ${t.balance < 0 ? "text-clay" : ""}`}>{money(t.balance)}</strong>
              <em>Entrées − sorties enregistrées</em>
            </div>
            <div>
              <span className="row" style={{ gap: 6 }}><ArrowDownLeft size={14} color={IN} /> Entrées</span>
              <strong className="display-num">{moneyShort(t.inflows.total)}</strong>
              <em>Ventes POS {moneyShort(t.inflows.sales)} · commandes {moneyShort(t.inflows.orders)} · autres {moneyShort(t.inflows.other)}</em>
            </div>
            <div>
              <span className="row" style={{ gap: 6 }}><ArrowUpRight size={14} color={OUT} /> Sorties</span>
              <strong className="display-num">{moneyShort(t.outflows.total)}</strong>
              <em>Dépenses {moneyShort(t.outflows.expenses)} · charges {moneyShort(t.outflows.charges)} · remb. {moneyShort(t.outflows.refunds)}</em>
            </div>
            <div>
              <span>Chiffre d'affaires</span>
              <strong className="display-num">{moneyShort(t.revenue)}</strong>
              <em className="row" style={{ gap: 4 }}><Info size={12} /> n'est pas un bénéfice</em>
            </div>
          </div>
          <div className="grid-main-side" style={{ marginBottom: 20 }}>
            <Panel title="Entrées et sorties par jour" actions={<span className="row small" style={{ gap: 14 }}><span className="legend-dot" style={{ "--c": IN }}>Entrées</span><span className="legend-dot" style={{ "--c": OUT }}>Sorties</span></span>}>
              <div style={{ height: 260 }}>
                {t.daily.length === 0 ? <Empty title="Aucun mouvement sur la période" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={t.daily} barGap={2} margin={{ left: 0, right: 4, top: 6 }}>
                      <CartesianGrid vertical={false} stroke="#ECECF4" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6E6E86" }} minTickGap={20}
                        tickFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} />
                      <YAxis tickLine={false} axisLine={false} width={54} tick={{ fontSize: 11, fill: "#6E6E86" }} tickFormatter={(v) => moneyShort(v).replace(" FC", "")} />
                      <Tooltip content={<Tip />} cursor={{ fill: "rgba(25,179,214,0.08)" }} />
                      <Bar dataKey="in" fill={IN} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="out" fill={OUT} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
            <div className="stack">
              <Panel title="Par catégorie">
                <div className="stack-sm">
                  {t.by_category.slice(0, 9).map((c, i) => (
                    <div key={`${c.category}-${c.direction}-${i}`} className="row-between small">
                      <span className="row" style={{ gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c.direction === "in" ? IN : OUT }} />{c.category}</span>
                      <span className="num">{c.direction === "out" ? "− " : ""}{moneyShort(c.total)}</span>
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="callout warn"><Info /><span>Charges à payer dans les 30 jours : <strong>{money(t.upcoming_dues)}</strong>.</span></div>
            </div>
          </div>
        </>
      )}
      <section className="panel">
        <div className="panel-head"><h3>Mouvements</h3></div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty title="Aucun mouvement" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Libellé</th><th>Origine</th><th>Agence</th><th>Moyen</th><th className="num">Montant</th></tr></thead>
              <tbody>
                {list.rows.map((x) => (
                  <tr key={x.id}>
                    <td className="small nowrap">{datetime(x.occurred_at)}<div className="cell-sub">{x.reference}</div></td>
                    <td className="small">{x.label}{x.external_reference && <div className="cell-sub">réf. {x.external_reference}</div>}</td>
                    <td><Pill plain tone={x.direction === "in" ? "brand" : "coral"}>{x.source_label}</Pill></td>
                    <td className="small">{x.agency_name}</td>
                    <td className="small">{x.method_name || "—"}</td>
                    <td className={`num strong ${x.direction === "out" ? "text-clay" : ""}`}>{x.direction === "out" ? "− " : "+ "}{money(x.amount, x.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      <ManualDrawer open={manual} onClose={() => setManual(false)} />
    </>
  );
}
