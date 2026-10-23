import { History, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Drawer, Empty, LoadingRows, PageHead, Pager, Pill } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { datetime } from "../lib/format";
import { useWorkspace } from "../lib/workspace";

const ENTITY = {
  stock: "Stock", price: "Prix", product: "Produit", expense: "Dépense", refund: "Remboursement", cash_session: "Caisse",
  user: "Utilisateur", role: "Rôle", order: "Commande", transfer: "Transfert", sale: "Vente", inventory: "Inventaire",
  due: "Échéance", agency: "Agence", settings: "Paramètres", finance: "Finances",
};

function Diff({ before, after }) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  if (!keys.length) return <p className="small muted">Aucun détail de valeur enregistré.</p>;
  const show = (v) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <table className="table">
      <thead><tr><th>Champ</th><th>Ancienne valeur</th><th>Nouvelle valeur</th></tr></thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td className="strong small">{k}</td>
            <td className="small text-clay" style={{ wordBreak: "break-word" }}>{show(before?.[k])}</td>
            <td className="small text-leaf" style={{ wordBreak: "break-word" }}>{show(after?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Audit() {
  const { params } = useWorkspace();
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("");
  const [sensitive, setSensitive] = useState("");
  const [open, setOpen] = useState(null);
  const q = useDebounced(search);
  const list = useList("/audit/", { ...params, search: q, entity_type: entity, sensitive });
  return (
    <>
      <PageHead title="Journal d'activité" lead="Qui a fait quoi, quand, dans quelle agence, avec l'ancienne et la nouvelle valeur. Le journal ne peut être ni modifié ni effacé." />
      <section className="panel">
        <div className="toolbar">
          <div className="input-group"><Search /><input className="input" placeholder="Élément, action, note" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="select" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Tous les éléments</option>
            {Object.entries(ENTITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="select" value={sensitive} onChange={(e) => setSensitive(e.target.value)}>
            <option value="">Toutes les actions</option>
            <option value="true">Actions sensibles</option>
          </select>
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={History} title="Aucune entrée" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Élément</th><th>Agence</th></tr></thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                    <td className="small nowrap">{datetime(r.at)}</td>
                    <td className="small">{r.user_name}<div className="cell-sub">{r.ip}</div></td>
                    <td><span className="row" style={{ gap: 6 }}>{r.sensitive && <ShieldAlert size={14} color="var(--coral-600)" />}<span className="code">{r.action}</span></span></td>
                    <td className="small"><Pill plain>{ENTITY[r.entity_type] || r.entity_type}</Pill> {r.entity_label}{r.note && <div className="cell-sub truncate" style={{ maxWidth: 320 }}>{r.note}</div>}</td>
                    <td className="small">{r.agency_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      {open && (
        <Drawer open onClose={() => setOpen(null)} wide title={open.entity_label || open.action} sub={`${datetime(open.at)} · ${open.user_name}${open.agency_name ? ` · ${open.agency_name}` : ""}`}>
          <div className="stack">
            <dl className="kv">
              <dt>Action</dt><dd className="code" style={{ justifySelf: "start" }}>{open.action}</dd>
              <dt>Élément</dt><dd>{ENTITY[open.entity_type] || open.entity_type} · {open.entity_id}</dd>
              <dt>Adresse IP</dt><dd>{open.ip || "—"}</dd>
              {open.note && (<><dt>Note</dt><dd>{open.note}</dd></>)}
            </dl>
            <Diff before={open.before} after={open.after} />
          </div>
        </Drawer>
      )}
    </>
  );
}
