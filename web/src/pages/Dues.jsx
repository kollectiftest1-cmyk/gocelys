import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { useState } from "react";

import { get, patch, post } from "../api/client";
import { Drawer, Empty, Field, LoadingRows, Modal, PageHead, Pager, Pill, Segmented, StatusPill, Tabs } from "../components/ui";
import { useList } from "../hooks/useList";
import { useAgencies, useFinanceCategories, usePaymentMethods } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { date, dateLong, isoDate, money, moneyShort } from "../lib/format";
import { DUE_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";
import "./dues.css";

const WEEK = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function PayModal({ due, onClose }) {
  const methods = usePaymentMethods();
  const toast = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState("");
  if (!due) return null;
  const pay = async () => {
    try {
      await post(`/dues/${due.id}/pay/`, { method });
      toast.success(`${due.charge_name} : échéance payée.`);
      qc.invalidateQueries({ queryKey: ["dues-cal"] });
      qc.invalidateQueries({ queryKey: ["/dues/"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Payer ${due.charge_name}`}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" onClick={pay}>Enregistrer le paiement</button></>}>
      <div className="stack">
        <dl className="kv">
          <dt>Échéance</dt><dd>{dateLong(due.due_date)}</dd>
          <dt>Montant</dt><dd className="num strong">{money(due.amount, due.currency)}</dd>
          <dt>Agence</dt><dd>{due.agency_name}</dd>
          <dt>Bénéficiaire</dt><dd>{due.beneficiary || "—"}</dd>
        </dl>
        <Field label="Moyen de paiement">
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function Calendar({ onPay }) {
  const { params } = useWorkspace();
  const [month, setMonth] = useState(() => isoDate().slice(0, 7));
  const { data } = useQuery({ queryKey: ["dues-cal", month, params], queryFn: () => get("/dues/calendar/", { month, ...params }) });
  const shift = (n) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const [y, m] = month.split("-").map(Number);
  const today = isoDate();
  const cells = [];
  if (data) {
    for (let i = 0; i < data.first_weekday; i++) cells.push(null);
    for (let d = 1; d <= data.days_in_month; d++) cells.push(d);
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="row">
          <button className="btn btn-sm btn-icon" onClick={() => shift(-1)} aria-label="Mois précédent"><ChevronLeft /></button>
          <h3 style={{ minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h3>
          <button className="btn btn-sm btn-icon" onClick={() => shift(1)} aria-label="Mois suivant"><ChevronRight /></button>
        </div>
        {data && (
          <div className="row small" style={{ gap: 18 }}>
            <span>À payer <strong className="num">{moneyShort(data.totals.to_pay)}</strong></span>
            <span className="text-clay">En retard <strong className="num">{moneyShort(data.totals.overdue)}</strong></span>
            <span className="text-leaf">Payé <strong className="num">{moneyShort(data.totals.paid)}</strong></span>
          </div>
        )}
      </div>
      <div className="cal">
        {WEEK.map((w) => <div key={w} className="cal-h">{w}</div>)}
        {cells.map((d, i) => {
          const iso = d ? `${month}-${String(d).padStart(2, "0")}` : "";
          const items = d ? data.days[d] || [] : [];
          return (
            <div key={i} className={`cal-d ${!d ? "pad" : ""} ${iso === today ? "today" : ""}`}>
              {d && <span className="cal-n">{d}</span>}
              {items.map((it) => (
                <button key={it.id} className={`cal-item st-${it.status}`} onClick={() => it.status !== "paid" && onPay(it)} title={`${it.charge_name} — ${it.agency_name}`}>
                  <span className="truncate">{it.charge_name}</span>
                  <span className="num">{moneyShort(it.amount, it.currency)}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DueList({ onPay }) {
  const { params } = useWorkspace();
  const [period, setPeriod] = useState("month");
  const [status, setStatus] = useState("");
  const list = useList("/dues/", { ...params, period, status });
  return (
    <section className="panel">
      <div className="toolbar">
        <Segmented value={period} onChange={setPeriod} options={[{ value: "today", label: "Aujourd'hui" }, { value: "week", label: "Cette semaine" }, { value: "month", label: "Ce mois" }, { value: "next_month", label: "Mois prochain" }, { value: "", label: "Tout" }]} />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(DUE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={CalendarClock} title="Aucune échéance" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Charge</th><th>Agence</th><th>Catégorie</th><th>Statut</th><th className="num">Montant</th><th /></tr></thead>
            <tbody>
              {list.rows.map((d) => (
                <tr key={d.id}>
                  <td className="nowrap">{date(d.due_date, { year: true })}</td>
                  <td className="cell-main">{d.charge_name}<div className="cell-sub">{d.beneficiary}</div></td>
                  <td className="small">{d.agency_name}</td>
                  <td className="small">{d.category_name}</td>
                  <td><StatusPill map={DUE_STATUS} value={d.status} /></td>
                  <td className="num strong">{money(d.amount, d.currency)}</td>
                  <td className="right">{d.status !== "paid" && <button className="btn btn-sm" onClick={() => onPay(d)}>Payer</button>}</td>
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

const FREQ = { daily: "Quotidienne", weekly: "Hebdomadaire", monthly: "Mensuelle", quarterly: "Trimestrielle", yearly: "Annuelle", custom: "Personnalisée" };

function ChargeDrawer({ charge, onClose }) {
  const agencies = useAgencies();
  const cats = useFinanceCategories().filter((c) => c.direction === "out");
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(charge?.id ? charge : { name: "", category: "", amount: "", currency: "USD", agency: "", beneficiary: "", frequency: "monthly", interval_days: 30, start_date: isoDate(), due_day: 30, remind_days_before: 5, status: "active" });
  if (!charge) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      const body = { ...f, end_date: f.end_date || null, due_day: f.due_day || null };
      if (f.id) await patch(`/charges/${f.id}/`, body);
      else await post("/charges/", body);
      toast.success("Charge enregistrée : les échéances sont générées automatiquement.");
      qc.invalidateQueries({ queryKey: ["/charges/"] });
      qc.invalidateQueries({ queryKey: ["dues-cal"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Drawer open onClose={onClose} title={f.id ? f.name : "Nouvelle charge récurrente"} sub="Loyer, internet, électricité, sécurité…"
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" onClick={save}>Enregistrer</button></>}>
      <div className="stack">
        <Field label="Nom"><input className="input" value={f.name} onChange={set("name")} placeholder="Loyer Agence Matadi" /></Field>
        <div className="form-grid">
          <Field label="Catégorie"><select className="select" value={f.category} onChange={set("category")}><option value="">Choisir…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Agence"><select className="select" value={f.agency} onChange={set("agency")}><option value="">Choisir…</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Montant"><input className="input num" type="number" value={f.amount} onChange={set("amount")} /></Field>
          <Field label="Devise"><select className="select" value={f.currency} onChange={set("currency")}><option>USD</option><option>CDF</option></select></Field>
          <Field label="Fréquence"><select className="select" value={f.frequency} onChange={set("frequency")}>{Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {f.frequency === "custom" ? (
            <Field label="Tous les … jours"><input className="input num" type="number" value={f.interval_days} onChange={set("interval_days")} /></Field>
          ) : ["monthly", "quarterly", "yearly"].includes(f.frequency) ? (
            <Field label="Jour d'échéance" hint="Ramené au dernier jour pour les mois courts"><input className="input num" type="number" min="1" max="31" value={f.due_day || ""} onChange={set("due_day")} /></Field>
          ) : <span />}
          <Field label="Première échéance à partir du"><input className="input" type="date" value={f.start_date} onChange={set("start_date")} /></Field>
          <Field label="Rappel (jours avant)"><input className="input num" type="number" value={f.remind_days_before} onChange={set("remind_days_before")} /></Field>
        </div>
        <Field label="Bénéficiaire"><input className="input" value={f.beneficiary} onChange={set("beneficiary")} /></Field>
        {f.id && (
          <Field label="Statut"><select className="select" value={f.status} onChange={set("status")}><option value="active">Active</option><option value="paused">Suspendue</option><option value="ended">Terminée</option></select></Field>
        )}
      </div>
    </Drawer>
  );
}

function Charges({ onEdit }) {
  const { params } = useWorkspace();
  const list = useList("/charges/", params);
  return (
    <section className="panel">
      {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={Repeat} title="Aucune charge récurrente" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Charge</th><th>Agence</th><th>Fréquence</th><th>Prochaine échéance</th><th>Statut</th><th className="num">Montant</th></tr></thead>
            <tbody>
              {list.rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => onEdit(c)}>
                  <td className="cell-main">{c.name}<div className="cell-sub">{c.category_name} · {c.beneficiary}</div></td>
                  <td className="small">{c.agency_name}</td>
                  <td className="small">{c.frequency_label}{c.due_day ? ` · le ${c.due_day}` : ""}</td>
                  <td className="small">{c.next_due ? <span className="row" style={{ gap: 8 }}>{date(c.next_due.due_date)} <StatusPill map={DUE_STATUS} value={c.next_due.status} /></span> : "—"}</td>
                  <td>{c.status === "active" ? <Pill tone="leaf" plain>Active</Pill> : <Pill plain>{c.status === "paused" ? "Suspendue" : "Terminée"}</Pill>}</td>
                  <td className="num strong">{money(c.amount, c.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Dues() {
  const { can } = useAuth();
  const [tab, setTab] = useState("calendar");
  const [paying, setPaying] = useState(null);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <PageHead title="Charges et échéances" lead="Chaque charge récurrente génère ses échéances. Rappel avant la date, alerte dès qu'une charge est échue."
        actions={can("charges.manage") && <button className="btn btn-action" onClick={() => setEditing({})}><Plus /> Nouvelle charge</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "calendar", label: "Calendrier" }, { value: "list", label: "Échéances" }, { value: "charges", label: "Charges récurrentes" }]} />
      {tab === "calendar" && <Calendar onPay={setPaying} />}
      {tab === "list" && <DueList onPay={setPaying} />}
      {tab === "charges" && <Charges onEdit={setEditing} />}
      <PayModal due={paying} onClose={() => setPaying(null)} />
      {editing && <ChargeDrawer charge={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
