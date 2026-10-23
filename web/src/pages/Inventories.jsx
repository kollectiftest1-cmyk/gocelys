import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { post } from "../api/client";
import { Empty, Field, LoadingRows, Modal, PageHead, Pager, StatusPill } from "../components/ui";
import { useList } from "../hooks/useList";
import { useAgencies, useCategories } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { datetime, num } from "../lib/format";
import { INVENTORY_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";

export default function Inventories() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { params, agency } = useWorkspace();
  const agencies = useAgencies().filter((a) => a.status !== "closed");
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ agency: agency || "", category: "", scope_note: "" });
  const list = useList("/inventories/", params);
  const start = async () => {
    try {
      const inv = await post("/inventories/", form);
      toast.success(`Inventaire ${inv.reference} ouvert : ${inv.lines.length} produits à compter.`);
      navigate(`/inventaires/${inv.id}`);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      <PageHead title="Inventaires" lead="Création → comptage → comparaison → validation → ajustement. Le stock théorique est figé au lancement."
        actions={can("inventory.manage") && <button className="btn btn-action" onClick={() => setOpen(true)}><Plus /> Lancer un inventaire</button>} />
      <section className="panel">
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={ClipboardList} title="Aucun inventaire">Lancez un premier comptage pour une agence.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Inventaire</th><th>Agence</th><th>Périmètre</th><th>Avancement</th><th className="num">Écarts</th><th>Statut</th></tr></thead>
              <tbody>
                {list.rows.map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => navigate(`/inventaires/${i.id}`)}>
                    <td><div className="cell-main">{i.reference}</div><div className="cell-sub">{datetime(i.created_at)} · {i.created_by_name}</div></td>
                    <td>{i.agency_name}</td>
                    <td className="small muted">{i.scope_note || "Tous les produits"}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="bar-track" style={{ height: 6, background: "var(--mist-100)", borderRadius: 3 }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 3, width: `${(i.progress.counted / Math.max(1, i.progress.total)) * 100}%`, background: "var(--sky-500)" }} />
                      </div>
                      <div className="cell-sub">{i.progress.counted} / {i.progress.total} comptés</div>
                    </td>
                    <td className={`num ${i.progress.gap_total < 0 ? "text-clay" : ""}`}>{i.progress.gaps ? `${i.progress.gaps} · ${i.progress.gap_total > 0 ? "+" : ""}${num(i.progress.gap_total)}` : "—"}</td>
                    <td><StatusPill map={INVENTORY_STATUS} value={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      <Modal open={open} onClose={() => setOpen(false)} title="Lancer un inventaire"
        footer={<><button className="btn" onClick={() => setOpen(false)}>Annuler</button><button className="btn btn-action" disabled={!form.agency} onClick={start}>Lancer le comptage</button></>}>
        <div className="stack">
          <Field label="Agence">
            <select className="select" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })}>
              <option value="">Choisir…</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Catégorie" hint="Laissez vide pour compter tous les produits actifs">
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Tous les produits</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Libellé"><input className="input" value={form.scope_note} onChange={(e) => setForm({ ...form, scope_note: e.target.value })} placeholder="Inventaire mensuel — octobre" /></Field>
        </div>
      </Modal>
    </>
  );
}
