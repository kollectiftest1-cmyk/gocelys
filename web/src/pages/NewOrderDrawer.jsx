import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { get, post } from "../api/client";
import LineEditor from "../components/LineEditor";
import { Drawer, Field, Segmented } from "../components/ui";
import { useDebounced } from "../hooks/useList";
import { useAgencies, usePaymentMethods } from "../hooks/useRef";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";

export default function NewOrderDrawer({ open, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { agency: currentAgency } = useWorkspace();
  const agencies = useAgencies().filter((a) => a.status === "active" && a.accepts_online_orders);
  const methods = usePaymentMethods().filter((m) => m.is_active && m.available_online);
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { data: found } = useQuery({ queryKey: ["cust-search", q], queryFn: () => get("/customers/", { search: q, page_size: 6 }), enabled: open && q.length > 1 });
  const [customer, setCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState(null);
  const [form, setForm] = useState({ agency: currentAgency || "", fulfillment: "delivery", address: "", line: "", landmark: "", payment_method: "", is_urgent: false, note: "" });
  const [lines, setLines] = useState([{ product: "", product_unit: "", quantity: 1 }]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  const reset = () => {
    setCustomer(null);
    setNewCustomer(null);
    setSearch("");
    setLines([{ product: "", product_unit: "", quantity: 1 }]);
  };

  const submit = async () => {
    const valid = lines.filter((l) => l.product_unit && Number(l.quantity) > 0);
    if (!customer && !newCustomer?.name) return toast.error("Choisissez ou créez le client.");
    if (!valid.length) return toast.error("Ajoutez au moins un produit.");
    setBusy(true);
    try {
      let c = customer;
      if (!c) c = await post("/customers/", { name: newCustomer.name, phone: newCustomer.phone, preferred_agency: form.agency || null });
      let address = form.address;
      if (form.fulfillment === "delivery" && !address) {
        if (!form.line) throw { response: { data: { detail: "Indiquez l'adresse de livraison." } } };
        const a = await post(`/customers/${c.id}/address/`, { label: "Adresse", line: form.line, landmark: form.landmark });
        address = a.id;
      }
      const order = await post("/orders/", {
        customer: c.id, agency: form.agency || null, fulfillment: form.fulfillment, address: form.fulfillment === "delivery" ? address : null,
        payment_method: form.payment_method || null, is_urgent: form.is_urgent, note: form.note, channel: "telephone",
        lines: valid.map((l) => ({ product_unit: Number(l.product_unit), quantity: Number(l.quantity) })),
      });
      toast.success(`Commande ${order.reference} créée, stock réservé à ${order.agency_name}.`);
      qc.invalidateQueries({ queryKey: ["orders-board"] });
      reset();
      onClose();
      navigate(`/commandes/${order.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} wide title="Saisir une commande" sub="Commande reçue par téléphone ou WhatsApp"
      footer={<>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-action" onClick={submit} disabled={busy}>{busy ? "Création…" : "Créer la commande"}</button>
      </>}>
      <div className="stack">
        <div className="field">
          <span className="field-label">Client</span>
          {customer ? (
            <div className="row-between callout">
              <span><strong>{customer.name}</strong> · {customer.phone}</span>
              <button className="btn btn-sm" onClick={() => setCustomer(null)}>Changer</button>
            </div>
          ) : newCustomer ? (
            <div className="form-grid">
              <input className="input" placeholder="Nom complet" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              <input className="input" placeholder="Téléphone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="row">
                <input className="input grow" placeholder="Rechercher par nom ou téléphone" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button className="btn" onClick={() => setNewCustomer({ name: search, phone: "" })}><UserPlus /> Nouveau client</button>
              </div>
              {found?.results?.length > 0 && (
                <div className="pick-list">
                  {found.results.map((c) => (
                    <button key={c.id} onClick={() => { setCustomer(c); setForm((f) => ({ ...f, address: c.addresses?.[0]?.id || "", agency: f.agency || c.preferred_agency || "" })); }}>
                      <strong>{c.name}</strong> <span className="muted">{c.phone}</span>
                      <span className="faint xs">{c.orders_count} commande(s)</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="form-grid">
          <Field label="Mode">
            <Segmented value={form.fulfillment} onChange={set("fulfillment")} options={[{ value: "delivery", label: "Livraison" }, { value: "pickup", label: "Retrait en agence" }]} />
          </Field>
          <Field label="Agence" hint="Si l'agence manque de stock, une autre agence est proposée automatiquement.">
            <select className="select" value={form.agency} onChange={set("agency")}>
              <option value="">Choix automatique</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>

        {form.fulfillment === "delivery" && (
          customer?.addresses?.length ? (
            <Field label="Adresse de livraison">
              <select className="select" value={form.address} onChange={set("address")}>
                {customer.addresses.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.line}</option>)}
                <option value="">Nouvelle adresse…</option>
              </select>
            </Field>
          ) : null
        )}
        {form.fulfillment === "delivery" && !form.address && (
          <div className="form-grid">
            <Field label="Adresse"><input className="input" value={form.line} onChange={set("line")} placeholder="Av. Kinkanda 14, Matadi" /></Field>
            <Field label="Repère"><input className="input" value={form.landmark} onChange={set("landmark")} placeholder="En face de la pharmacie" /></Field>
          </div>
        )}

        <div className="field">
          <span className="field-label">Produits</span>
          <LineEditor lines={lines} onChange={setLines} />
        </div>

        <div className="form-grid">
          <Field label="Paiement prévu">
            <select className="select" value={form.payment_method} onChange={set("payment_method")}>
              <option value="">Espèces à la livraison</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Note pour l'agence">
            <input className="input" value={form.note} onChange={set("note")} placeholder="Appeler avant de passer" />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.is_urgent} onChange={set("is_urgent")} /> Commande urgente (prioritaire dans le tableau de préparation)
        </label>
      </div>
    </Drawer>
  );
}
