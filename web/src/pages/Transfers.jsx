import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowLeftRight, PackageCheck, Plus, Search, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { get, post } from "../api/client";
import LineEditor from "../components/LineEditor";
import { Drawer, Empty, Field, LoadingRows, PageHead, Pager, StatusPill } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { useAgencies } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { datetime, num } from "../lib/format";
import { TRANSFER_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";

const FLOW = ["requested", "validated", "shipped", "closed"];
const FLOW_LABEL = { requested: "Demande", validated: "Validation", shipped: "Expédition", closed: "Réception" };

function TransferDrawer({ id, onClose }) {
  const { can, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: t } = useQuery({ queryKey: ["transfer", id], queryFn: () => get(`/transfers/${id}/`), enabled: Boolean(id) });
  const [received, setReceived] = useState({});
  const [damaged, setDamaged] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReceived({});
    setDamaged({});
    setNote("");
  }, [id]);
  if (!id) return null;
  const act = async (action, body = {}, msg) => {
    setBusy(true);
    try {
      qc.setQueryData(["transfer", id], await post(`/transfers/${id}/${action}/`, body));
      qc.invalidateQueries({ queryKey: ["/transfers/"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      toast.success(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const agencyIds = (user?.agencies || []).map((a) => a.id);
  const atSource = t && (user.is_global || agencyIds.includes(t.source));
  const atDest = t && (user.is_global || agencyIds.includes(t.destination));
  const stepIndex = t ? FLOW.indexOf(t.status) : -1;
  return (
    <Drawer open onClose={onClose} wide title={t?.reference || "Transfert"} sub={t && <span className="row" style={{ gap: 8 }}>{t.source_name} <ArrowRight size={14} /> {t.destination_name}</span>}
      footer={t && (
        <>
          {["requested", "validated"].includes(t.status) && <button className="btn btn-danger" disabled={busy} onClick={() => act("cancel", { note }, "Transfert annulé.")}>Annuler</button>}
          {t.status === "requested" && can("transfers.validate") && atSource && (
            <>
              <button className="btn" disabled={busy} onClick={() => act("reject", { note }, "Transfert refusé.")}>Refuser</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => act("validate", { note }, "Transfert validé.")}>Valider la demande</button>
            </>
          )}
          {t.status === "validated" && can("transfers.ship") && atSource && (
            <button className="btn btn-action" disabled={busy} onClick={() => act("ship", {}, "Expédié : le stock passe « en transfert ».")}><Send /> Confirmer l'expédition</button>
          )}
          {t.status === "shipped" && can("transfers.receive") && atDest && (
            <button className="btn btn-action" disabled={busy} onClick={() => act("receive", { received, damaged, note }, "Réception enregistrée, stock disponible à destination.")}>
              <PackageCheck /> Confirmer la réception
            </button>
          )}
        </>
      )}>
      {!t ? <LoadingRows rows={4} /> : (
        <div className="stack">
          <div className="progress-steps" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {FLOW.map((s, i) => <div key={s} className={i <= stepIndex ? "done" : ""}>{FLOW_LABEL[s]}</div>)}
          </div>
          <dl className="kv">
            <dt>Statut</dt><dd><StatusPill map={TRANSFER_STATUS} value={t.status} /></dd>
            <dt>Demandé par</dt><dd>{t.requested_by_name} · {datetime(t.created_at)}</dd>
            {t.reason && (<><dt>Motif</dt><dd>{t.reason}</dd></>)}
            {t.shipped_at && (<><dt>Expédié</dt><dd>{datetime(t.shipped_at)}</dd></>)}
            {t.received_at && (<><dt>Réceptionné</dt><dd>{datetime(t.received_at)}</dd></>)}
            {t.note && (<><dt>Notes</dt><dd style={{ whiteSpace: "pre-line" }}>{t.note}</dd></>)}
          </dl>
          <table className="table">
            <thead>
              <tr>
                <th>Produit</th><th className="num">Demandé</th><th className="num">Expédié</th>
                {t.status === "shipped" ? <><th className="num">Reçu bon état</th><th className="num">Endommagé</th></> : <><th className="num">Reçu</th><th className="num">Endommagé</th></>}
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l) => (
                <tr key={l.id}>
                  <td className="cell-main">{l.product_name}<div className="cell-sub">en {l.unit.toLowerCase()}s</div></td>
                  <td className="num">{num(l.quantity)}</td>
                  <td className="num">{l.shipped_quantity !== null ? num(l.shipped_quantity) : "—"}</td>
                  {t.status === "shipped" ? (
                    <>
                      <td className="num"><input className="input num" style={{ width: 90, height: 32 }} type="number" min="0" placeholder={num(Number(l.shipped_quantity) - Number(damaged[l.product] || 0))}
                        value={received[l.product] ?? ""} onChange={(e) => setReceived({ ...received, [l.product]: e.target.value })} /></td>
                      <td className="num"><input className="input num" style={{ width: 80, height: 32 }} type="number" min="0" placeholder="0"
                        value={damaged[l.product] ?? ""} onChange={(e) => setDamaged({ ...damaged, [l.product]: e.target.value })} /></td>
                    </>
                  ) : (
                    <>
                      <td className="num">{l.received_quantity !== null ? num(l.received_quantity) : "—"}</td>
                      <td className={`num ${Number(l.damaged_quantity) ? "text-clay" : ""}`}>{Number(l.damaged_quantity) ? num(l.damaged_quantity) : "—"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {t.status === "shipped" && <p className="xs faint">Laissez vide pour recevoir la quantité expédiée. Tout manquant est enregistré comme perdu, avec traçabilité.</p>}
          {["requested", "validated", "shipped"].includes(t.status) && (
            <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observation, n° du bon, chauffeur…" /></Field>
          )}
        </div>
      )}
    </Drawer>
  );
}

function NewTransfer({ open, onClose }) {
  const { agency } = useWorkspace();
  const agencies = useAgencies().filter((a) => a.status !== "closed");
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState(agency || "");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState([{ product: "", quantity: 1 }]);
  const { data: levels } = useQuery({ queryKey: ["levels-src", source], queryFn: () => get("/stock/levels/", { agency: source }), enabled: Boolean(source) });
  const stock = Object.fromEntries((levels?.results || []).map((r) => [r.product, r.available]));
  const submit = async () => {
    try {
      const t = await post("/transfers/", {
        source, destination, reason,
        lines: lines.filter((l) => l.product && Number(l.quantity) > 0).map((l) => ({ product: Number(l.product), quantity: Number(l.quantity) })),
      });
      toast.success(`Transfert ${t.reference} demandé.`);
      qc.invalidateQueries({ queryKey: ["/transfers/"] });
      onClose();
      navigate(`/transferts/${t.id}`);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} wide title="Demander un transfert" sub="Demande → validation → expédition → réception"
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" disabled={!source || !destination} onClick={submit}>Envoyer la demande</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Depuis l'agence">
            <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choisir…</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Vers l'agence">
            <select className="select" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">Choisir…</option>
              {agencies.filter((a) => String(a.id) !== String(source)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Produits" hint="Quantités en unité de stock. Le disponible affiché est celui de l'agence source.">
          <LineEditor mode="base" lines={lines} onChange={setLines} stock={source ? stock : undefined} />
        </Field>
        <Field label="Motif"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Réassort hebdomadaire, dépannage…" /></Field>
      </div>
    </Drawer>
  );
}

export default function Transfers() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { can } = useAuth();
  const { params } = useWorkspace();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState(sp.get("search") || "");
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const list = useList("/transfers/", { ...params, status, search: q });
  return (
    <>
      <PageHead title="Transferts entre agences" lead="Un produit en transfert n'est plus vendable à la source et pas encore disponible à destination."
        actions={can("transfers.request") && <button className="btn btn-action" onClick={() => setCreating(true)}><Plus /> Demander un transfert</button>} />
      <section className="panel">
        <div className="toolbar">
          <div className="input-group">
            <Search />
            <input className="input" placeholder="Référence TRF-…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(TRANSFER_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={ArrowLeftRight} title="Aucun transfert" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Transfert</th><th>Trajet</th><th className="num">Unités</th><th>Demandé par</th><th>Statut</th></tr></thead>
              <tbody>
                {list.rows.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/transferts/${t.id}`)}>
                    <td><div className="cell-main">{t.reference}</div><div className="cell-sub">{datetime(t.created_at)}</div></td>
                    <td className="small"><span className="row" style={{ gap: 6 }}>{t.source_name} <ArrowRight size={13} className="faint" /> {t.destination_name}</span>{t.reason && <div className="cell-sub">{t.reason}</div>}</td>
                    <td className="num">{num(t.total_quantity)}</td>
                    <td className="small">{t.requested_by_name}</td>
                    <td><StatusPill map={TRANSFER_STATUS} value={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      {id && <TransferDrawer id={id} onClose={() => navigate("/transferts")} />}
      <NewTransfer open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
