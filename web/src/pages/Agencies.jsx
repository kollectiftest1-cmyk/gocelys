import { useQueryClient } from "@tanstack/react-query";
import { Building2, Factory, MapPin, Phone, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { patch, post } from "../api/client";
import { Drawer, Empty, Field, LoadingRows, PageHead, StatusPill } from "../components/ui";
import { useList } from "../hooks/useList";
import { useAuth } from "../lib/auth";
import { AGENCY_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";
import "./agencies.css";

export function AgencyForm({ agency, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(agency?.id ? agency : { code: "", name: "", city: "", address: "", phone: "", latitude: "", longitude: "", status: "active", accepts_online_orders: true, is_production_site: false, color: "#22C3E6" });
  if (!agency) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      const body = { ...f, latitude: f.latitude || null, longitude: f.longitude || null, manager: f.manager || null };
      if (f.id) await patch(`/agencies/${f.id}/`, body);
      else await post("/agencies/", body);
      toast.success(f.id ? "Agence mise à jour." : "Agence créée. Ajoutez maintenant ses postes de vente.");
      qc.invalidateQueries({ queryKey: ["/agencies/"] });
      qc.invalidateQueries({ queryKey: ["ref", "agencies"] });
      qc.invalidateQueries({ queryKey: ["agency"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Drawer open onClose={onClose} title={f.id ? `Modifier ${f.name}` : "Nouvelle agence"}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" onClick={save}>Enregistrer</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Nom"><input className="input" value={f.name} onChange={set("name")} placeholder="Matadi Centre" /></Field>
          <Field label="Code" hint="3 lettres, utilisé dans les références"><input className="input" value={f.code} onChange={set("code")} maxLength={12} placeholder="MAT" /></Field>
          <Field label="Ville"><input className="input" value={f.city} onChange={set("city")} /></Field>
          <Field label="Téléphone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Adresse" className="span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
          <Field label="Latitude"><input className="input num" value={f.latitude ?? ""} onChange={set("latitude")} placeholder="-5.8165" /></Field>
          <Field label="Longitude"><input className="input num" value={f.longitude ?? ""} onChange={set("longitude")} placeholder="13.4580" /></Field>
          <Field label="Statut">
            <select className="select" value={f.status} onChange={set("status")}>{Object.entries(AGENCY_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Couleur"><input className="input" type="color" value={f.color || "#22C3E6"} onChange={set("color")} style={{ padding: 4 }} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.accepts_online_orders} onChange={set("accepts_online_orders")} /> Reçoit les commandes de l'application client</label>
        <label className="check"><input type="checkbox" checked={f.is_production_site} onChange={set("is_production_site")} /> Site de production / dépôt central</label>
      </div>
    </Drawer>
  );
}

export default function Agencies() {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const list = useList("/agencies/", { page_size: 100 });
  return (
    <>
      <PageHead title="Agences" lead="Points de vente, dépôt et périmètre de chaque équipe."
        actions={can("agencies.manage") && <button className="btn btn-action" onClick={() => setEditing({})}><Plus /> Nouvelle agence</button>} />
      {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={Building2} title="Aucune agence" /> : (
        <div className="agency-grid">
          {list.rows.map((a) => (
            <Link key={a.id} to={`/agences/${a.id}`} className="agency-card" style={{ "--c": a.color || "#22C3E6" }}>
              <div className="row-between">
                <span className="agency-code">{a.code}</span>
                <StatusPill map={AGENCY_STATUS} value={a.status} />
              </div>
              <h3>{a.name}</h3>
              <div className="xs muted row" style={{ gap: 6 }}><MapPin size={13} /> {a.address || a.city}</div>
              {a.phone && <div className="xs muted row" style={{ gap: 6 }}><Phone size={13} /> {a.phone}</div>}
              <div className="agency-stats">
                <div><strong>{a.pos_count}</strong><span>postes</span></div>
                <div><strong>{a.staff_count}</strong><span>personnes</span></div>
                <div><strong>{a.open_sessions}</strong><span>caisses ouvertes</span></div>
              </div>
              <div className="xs faint row" style={{ gap: 6 }}>
                {a.is_production_site ? <><Factory size={13} /> Dépôt central</> : a.accepts_online_orders ? "Reçoit les commandes en ligne" : "Pas de commandes en ligne"}
                {a.manager_name && <> · {a.manager_name}</>}
              </div>
            </Link>
          ))}
        </div>
      )}
      <AgencyForm agency={editing} onClose={() => setEditing(null)} />
    </>
  );
}
