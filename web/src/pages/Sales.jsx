import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Receipt, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { post } from "../api/client";
import { Drawer, Empty, Field, LoadingRows, Modal, PageHead, Pager, Pill, StatusPill } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { useAuth } from "../lib/auth";
import { datetime, isoDate, money, num } from "../lib/format";
import { SALE_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";

function SaleDrawer({ sale, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!sale) return null;
  const run = async () => {
    setBusy(true);
    try {
      const s = await post(`/sales/${sale.id}/${mode}/`, { reason });
      toast.success(mode === "cancel" ? "Vente annulée, stock remis en rayon." : "Vente remboursée.");
      onChanged(s);
      setMode(null);
      setReason("");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={sale.reference} sub={`${sale.agency_name} · ${sale.pos_name} · ${datetime(sale.occurred_at)}`}
      footer={sale.status === "completed" && (can("sales.cancel") || can("sales.refund")) && (
        <>
          {can("sales.refund") && <button className="btn" onClick={() => setMode("refund")}>Rembourser</button>}
          {can("sales.cancel") && <button className="btn btn-danger" onClick={() => setMode("cancel")}>Annuler la vente</button>}
        </>
      )}>
      <div className="stack">
        <div className="row wrap">
          <StatusPill map={SALE_STATUS} value={sale.status} />
          {sale.created_offline && <Pill tone="amber"><CloudOff size={12} /> Saisie hors ligne {sale.offline_reference}</Pill>}
        </div>
        <dl className="kv">
          <dt>Caissier</dt><dd>{sale.cashier_name}</dd>
          <dt>Client</dt><dd>{sale.customer_name || "Client de passage"}</dd>
          {sale.cancel_reason && (<><dt>Motif d'annulation</dt><dd>{sale.cancel_reason}</dd></>)}
        </dl>
        <table className="table">
          <thead><tr><th>Article</th><th className="num">Qté</th><th className="num">P.U.</th><th className="num">Total</th></tr></thead>
          <tbody>
            {sale.lines.map((l) => (
              <tr key={l.id}><td>{l.label}</td><td className="num">{num(l.quantity)}</td><td className="num">{money(l.unit_price)}</td><td className="num strong">{money(l.total)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div className="row-between"><span className="muted">Sous-total</span><span className="num">{money(sale.subtotal)}</span></div>
          {Number(sale.discount) > 0 && <div className="row-between"><span className="muted">Remise</span><span className="num">− {money(sale.discount)}</span></div>}
          <div className="row-between grand"><span>Total</span><span className="num">{money(sale.total)}</span></div>
          {sale.payments.map((p) => (
            <div key={p.id} className="row-between"><span className="muted">{p.method_name}{p.reference ? ` · ${p.reference}` : ""}</span><span className="num">{money(p.amount)}</span></div>
          ))}
          {Number(sale.change_due) > 0 && <div className="row-between"><span className="muted">Monnaie rendue</span><span className="num">{money(sale.change_due)}</span></div>}
        </div>
      </div>
      <Modal open={Boolean(mode)} onClose={() => setMode(null)} title={mode === "cancel" ? "Annuler cette vente ?" : "Rembourser cette vente ?"}
        footer={<><button className="btn" onClick={() => setMode(null)}>Retour</button><button className="btn btn-danger" disabled={!reason || busy} onClick={run}>Confirmer</button></>}>
        <p className="small muted" style={{ marginBottom: 12 }}>Le stock est remis en disponible et une sortie de {money(sale.total)} est enregistrée en finances. L'opération est journalisée.</p>
        <Field label="Motif"><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Erreur de saisie, produit défectueux…" /></Field>
      </Modal>
    </Drawer>
  );
}

export default function Sales() {
  const [sp] = useSearchParams();
  const { params } = useWorkspace();
  const qc = useQueryClient();
  const [search, setSearch] = useState(sp.get("search") || "");
  const [status, setStatus] = useState("");
  const [since, setSince] = useState(isoDate(new Date(Date.now() - 6 * 86400000)));
  const [until, setUntil] = useState(isoDate());
  const [offline, setOffline] = useState("");
  const [open, setOpen] = useState(null);
  const q = useDebounced(search);
  const list = useList("/sales/", { ...params, search: q, status, since, until, created_offline: offline });
  const total = list.rows.reduce((s, r) => s + (r.status === "completed" ? Number(r.total) : 0), 0);

  return (
    <>
      <PageHead title="Ventes POS" lead="Toutes les ventes encaissées en agence, y compris celles saisies hors connexion puis synchronisées." />
      <section className="panel">
        <div className="toolbar">
          <div className="input-group">
            <Search />
            <input className="input" placeholder="Ticket, client" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input className="input" type="date" value={since} onChange={(e) => setSince(e.target.value)} style={{ width: 150 }} aria-label="Du" />
          <input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} style={{ width: 150 }} aria-label="Au" />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(SALE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="select" value={offline} onChange={(e) => setOffline(e.target.value)}>
            <option value="">En ligne et hors ligne</option>
            <option value="true">Saisies hors ligne</option>
          </select>
          <span className="grow" />
          <span className="small muted">Page : <strong className="num">{money(total)}</strong></span>
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={Receipt} title="Aucune vente sur cette période" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Ticket</th><th>Agence · poste</th><th>Caissier</th><th className="num">Articles</th><th>Paiement</th><th>Statut</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {list.rows.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => setOpen(s)}>
                    <td>
                      <div className="cell-main row" style={{ gap: 6 }}>{s.reference}{s.created_offline && <CloudOff size={13} color="var(--amber-600)" />}</div>
                      <div className="cell-sub">{datetime(s.occurred_at)}</div>
                    </td>
                    <td className="small">{s.agency_name}<div className="cell-sub">{s.pos_name}</div></td>
                    <td className="small">{s.cashier_name}</td>
                    <td className="num">{num(s.items_count)}</td>
                    <td className="small">{s.payments.map((p) => p.method_name).join(", ")}</td>
                    <td><StatusPill map={SALE_STATUS} value={s.status} /></td>
                    <td className="num strong">{money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      <SaleDrawer sale={open} onClose={() => setOpen(null)} onChanged={(s) => { setOpen(s); qc.invalidateQueries({ queryKey: ["/sales/"] }); }} />
    </>
  );
}
