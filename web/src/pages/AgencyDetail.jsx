import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { get, patch, post } from "../api/client";
import { Field, Modal, PageHead, Panel, Pill, Skeleton, StatusPill } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ago, money, moneyShort } from "../lib/format";
import { AGENCY_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import { AgencyForm } from "./Agencies";

export default function AgencyDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: a } = useQuery({ queryKey: ["agency", id], queryFn: () => get(`/agencies/${id}/`) });
  const { data: stats } = useQuery({ queryKey: ["agency-stats", id], queryFn: () => get(`/agencies/${id}/stats/`) });
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  if (!a) return <Skeleton h={400} />;

  const save = async () => {
    try {
      if (modal === "pos") await post("/pos/", { agency: a.id, code: form.code, name: form.name, default_float: form.default_float || 0 });
      if (modal === "pos-edit") await patch(`/pos/${form.id}/`, { name: form.name, default_float: form.default_float || 0, is_active: form.is_active });
      if (modal === "zone") await post("/zones/", { agency: a.id, name: form.name, fee: form.fee || 0, min_order: form.min_order || 0, estimated_minutes: form.minutes || 45 });
      toast.success({ pos: "Caisse ajoutée.", "pos-edit": "Caisse mise à jour.", zone: "Zone de livraison ajoutée." }[modal]);
      qc.invalidateQueries({ queryKey: ["agency", id] });
      setModal(null);
      setForm({});
    } catch (e) {
      toast.error(e);
    }
  };
  const toggleZone = async (z) => {
    await patch(`/zones/${z.id}/`, { is_active: !z.is_active });
    qc.invalidateQueries({ queryKey: ["agency", id] });
  };

  return (
    <>
      <PageHead crumb={[{ label: "Agences", to: "/agences" }, { label: a.name }]}
        title={<span className="row" style={{ gap: 12 }}><span className="agency-dot" style={{ background: a.color, width: 12, height: 12 }} />{a.name} <StatusPill map={AGENCY_STATUS} value={a.status} /></span>}
        lead={<span className="row" style={{ gap: 6 }}><MapPin size={14} /> {a.address}, {a.city}{a.manager_name ? ` · Responsable : ${a.manager_name}` : ""}</span>}
        actions={can("agencies.manage") && <button className="btn" onClick={() => setEditing(a)}><Pencil /> Modifier</button>} />
      {stats && (
        <div className="stock-summary" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div><span>Ventes du jour</span><strong className="display-num">{moneyShort(stats.sales_today)}</strong></div>
          <div><span>Ventes du mois</span><strong className="display-num">{moneyShort(stats.sales_month)}</strong></div>
          <div><span>Commandes en cours</span><strong className="display-num">{stats.orders_open}</strong></div>
          <div><span>Produits sous le seuil</span><strong className={`display-num ${stats.low_stock ? "text-clay" : ""}`}>{stats.low_stock}</strong></div>
        </div>
      )}
      <div className="grid-2">
        <Panel title="Caisses" sub="Chaque caisse a son tiroir, son fonds habituel et ses caissiers affectés"
          actions={can("agencies.manage") && <button className="btn btn-sm" onClick={() => { setModal("pos"); setForm({ code: `POS${a.points_of_sale.length + 1}`, name: `Caisse ${a.points_of_sale.length + 1}`, default_float: 50000 }); }}><Plus /> Ajouter</button>}>
          <div className="stack-sm">
            {a.points_of_sale.map((p) => (
              <div key={p.id} className="pos-line-admin">
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{p.name}</strong> <span className="faint xs">{p.code}</span>
                    {!p.is_active && <Pill plain>désactivée</Pill>}
                    {p.open_session ? <Pill tone="sky">Ouverte · {p.open_session.cashier}</Pill> : <Pill plain>Fermée</Pill>}
                  </div>
                  <div className="xs muted">
                    Fonds habituel {money(p.default_float)} · {p.cashiers.length ? `Caissier(s) : ${p.cashiers.map((c) => c.name).join(", ")}` : "aucun caissier affecté"}
                    {p.last_sync_at ? ` · synchro ${ago(p.last_sync_at)}` : ""}
                  </div>
                </div>
                {can("agencies.manage") && (
                  <button className="btn btn-sm" onClick={() => { setModal("pos-edit"); setForm({ id: p.id, name: p.name, default_float: Math.round(Number(p.default_float)), is_active: p.is_active }); }}>
                    <Pencil /> Modifier
                  </button>
                )}
              </div>
            ))}
            {a.points_of_sale.length === 0 && <p className="small muted">Aucun poste de vente.</p>}
          </div>
        </Panel>
        <Panel title="Zones de livraison" sub="Frais et délai annoncés au client"
          actions={can("deliveries.manage", "agencies.manage") && <button className="btn btn-sm" onClick={() => { setModal("zone"); setForm({}); }}><Plus /> Ajouter</button>}>
          <div className="stack-sm">
            {a.zones.map((z) => (
              <div key={z.id} className="row-between small">
                <span><strong>{z.name}</strong> <span className="faint">· ~{z.estimated_minutes} min</span></span>
                <span className="row">
                  <span className="num">{money(z.fee)}</span>
                  <button className="btn btn-sm" onClick={() => toggleZone(z)}>{z.is_active ? "Désactiver" : "Activer"}</button>
                </span>
              </div>
            ))}
            {a.zones.length === 0 && <p className="small muted">Aucune zone : seul le retrait en agence est possible.</p>}
          </div>
        </Panel>
        <Panel title="Horaires">
          <dl className="kv">
            {Object.entries(a.opening_hours || {}).map(([d, h]) => (<span key={d} style={{ display: "contents" }}><dt style={{ textTransform: "capitalize" }}>{d}</dt><dd>{h}</dd></span>))}
          </dl>
        </Panel>
      </div>
      {editing && <AgencyForm agency={editing} onClose={() => setEditing(null)} />}
      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={{ pos: "Nouvelle caisse", "pos-edit": "Modifier la caisse", zone: "Nouvelle zone de livraison" }[modal]}
        footer={<><button className="btn" onClick={() => setModal(null)}>Annuler</button><button className="btn btn-action" onClick={save}>Ajouter</button></>}>
        {modal === "pos" || modal === "pos-edit" ? (
          <div className="stack">
            <div className="form-grid">
              {modal === "pos" && <Field label="Code"><input className="input" value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>}
              <Field label="Nom"><input className="input" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Fonds de caisse habituel (FC)" hint="Proposé à l'ouverture ; le caissier confirme après comptage." className={modal === "pos-edit" ? "" : "span-2"}>
                <input className="input num" type="number" min="0" value={form.default_float ?? ""} onChange={(e) => setForm({ ...form, default_float: e.target.value })} />
              </Field>
            </div>
            {modal === "pos-edit" && <label className="check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Caisse active</label>}
            <p className="xs faint">Les caissiers s'affectent à une caisse depuis <strong>Utilisateurs et rôles</strong>.</p>
          </div>
        ) : (
          <div className="form-grid">
            <Field label="Quartier / zone" className="span-2"><input className="input" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mvuzi" /></Field>
            <Field label="Frais (FC)"><input className="input num" type="number" value={form.fee || ""} onChange={(e) => setForm({ ...form, fee: e.target.value })} /></Field>
            <Field label="Délai estimé (min)"><input className="input num" type="number" value={form.minutes || ""} onChange={(e) => setForm({ ...form, minutes: e.target.value })} /></Field>
            <Field label="Commande minimum (FC)"><input className="input num" type="number" value={form.min_order || ""} onChange={(e) => setForm({ ...form, min_order: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
