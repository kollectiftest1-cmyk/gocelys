import { useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, Check, Paperclip, Plus, Search, X } from "lucide-react";
import { useState } from "react";

import { api, post } from "../api/client";
import { Drawer, Empty, Field, LoadingRows, PageHead, Pager, StatusPill, Tabs } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { useAgencies, useFinanceCategories, usePaymentMethods } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { date, isoDate, money } from "../lib/format";
import { EXPENSE_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";

function NewExpense({ open, onClose }) {
  const { agency } = useWorkspace();
  const agencies = useAgencies().filter((a) => a.status !== "closed");
  const cats = useFinanceCategories().filter((c) => c.is_expense);
  const methods = usePaymentMethods();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ category: "", amount: "", currency: "CDF", agency: agency || "", beneficiary: "", reason: "", spent_on: isoDate(), method: "" });
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (payNow) => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => v !== "" && fd.append(k, v));
      if (receipt) fd.append("receipt", receipt);
      if (payNow) fd.append("pay_now", "true");
      const r = await api.post("/expenses/", fd);
      toast.success(r.data.status === "pending" ? "Dépense enregistrée : elle dépasse le seuil et attend une validation." : payNow && r.data.status === "paid" ? "Dépense enregistrée et payée." : "Dépense enregistrée.");
      qc.invalidateQueries({ queryKey: ["/expenses/"] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const ok = f.category && f.amount && f.agency && f.reason;
  return (
    <Drawer open={open} onClose={onClose} title="Nouvelle dépense" sub="Chaque dépense est liée à une catégorie, une agence et la personne qui la saisit"
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn" disabled={!ok || busy} onClick={() => save(false)}>Enregistrer</button><button className="btn btn-action" disabled={!ok || busy} onClick={() => save(true)}>Enregistrer et payer</button></>}>
      <div className="stack">
        <Field label="Catégorie"><select className="select" value={f.category} onChange={set("category")}><option value="">Choisir…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <div className="form-grid">
          <Field label="Montant"><input className="input num" type="number" value={f.amount} onChange={set("amount")} placeholder="50 000" /></Field>
          <Field label="Devise"><select className="select" value={f.currency} onChange={set("currency")}><option>CDF</option><option>USD</option></select></Field>
          <Field label="Agence"><select className="select" value={f.agency} onChange={set("agency")}><option value="">Choisir…</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Date"><input className="input" type="date" value={f.spent_on} onChange={set("spent_on")} /></Field>
        </div>
        <Field label="Motif"><input className="input" value={f.reason} onChange={set("reason")} placeholder="Carburant — livraisons du jour" /></Field>
        <Field label="Bénéficiaire"><input className="input" value={f.beneficiary} onChange={set("beneficiary")} placeholder="Station Engen Matadi" /></Field>
        <Field label="Moyen de paiement"><select className="select" value={f.method} onChange={set("method")}><option value="">—</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Justificatif" hint="Photo du reçu ou facture (PDF)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setReceipt(e.target.files[0])} /></Field>
      </div>
    </Drawer>
  );
}

export default function Expenses() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { params } = useWorkspace();
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const list = useList("/expenses/", { ...params, status: tab, search: q });
  const pending = useList("/expenses/", { ...params, status: "pending" }, { pageSize: 1 });

  const act = async (e, action, body = {}) => {
    try {
      await post(`/expenses/${e.id}/${action}/`, body);
      toast.success({ approve: "Dépense validée.", reject: "Dépense refusée.", pay: "Paiement enregistré en trésorerie." }[action]);
      qc.invalidateQueries({ queryKey: ["/expenses/"] });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHead title="Dépenses" lead="Dépenses ponctuelles des agences. Au-delà du seuil défini, une validation est requise avant paiement."
        actions={can("expenses.create") && <button className="btn btn-action" onClick={() => setCreating(true)}><Plus /> Nouvelle dépense</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "", label: "Toutes" },
        { value: "pending", label: "À valider", count: pending.count },
        { value: "approved", label: "À payer" },
        { value: "paid", label: "Payées" },
        { value: "rejected", label: "Refusées" },
      ]} />
      <section className="panel">
        <div className="toolbar">
          <div className="input-group"><Search /><input className="input" placeholder="Motif, bénéficiaire, référence" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={BookOpenCheck} title="Aucune dépense" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Dépense</th><th>Catégorie</th><th>Agence</th><th>Saisie par</th><th>Statut</th><th className="num">Montant</th><th /></tr></thead>
              <tbody>
                {list.rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="cell-main row" style={{ gap: 6 }}>{e.reason}{e.receipt && <a href={e.receipt} target="_blank" rel="noreferrer" title="Justificatif"><Paperclip size={13} /></a>}</div>
                      <div className="cell-sub">{e.reference} · {date(e.spent_on)}{e.beneficiary ? ` · ${e.beneficiary}` : ""}</div>
                    </td>
                    <td className="small">{e.category_name}</td>
                    <td className="small">{e.agency_name}</td>
                    <td className="small">{e.created_by_name}{e.approved_by_name && <div className="cell-sub">validée par {e.approved_by_name}</div>}</td>
                    <td><StatusPill map={EXPENSE_STATUS} value={e.status} />{e.rejection_reason && <div className="cell-sub">{e.rejection_reason}</div>}</td>
                    <td className="num strong">{money(e.amount, e.currency)}</td>
                    <td className="right nowrap">
                      {e.status === "pending" && can("expenses.approve") && (
                        <>
                          <button className="btn btn-sm btn-icon" title="Refuser" aria-label="Refuser" onClick={() => act(e, "reject", { reason: "Refusée" })}><X /></button>{" "}
                          <button className="btn btn-sm btn-primary" onClick={() => act(e, "approve")}><Check /> Valider</button>
                        </>
                      )}
                      {e.status === "approved" && can("finance.manage", "expenses.create") && <button className="btn btn-sm" onClick={() => act(e, "pay", { method: e.method })}>Marquer payée</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      <NewExpense open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
