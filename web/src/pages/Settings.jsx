import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import { get, patch } from "../api/client";
import { Field, PageHead, Panel, Pill, Skeleton } from "../components/ui";
import { usePaymentMethods } from "../hooks/useRef";
import { useToast } from "../lib/toast";

const ASSIGN = {
  chosen: "Toujours l'agence choisie par le client",
  chosen_then_stock: "Agence choisie, sinon une agence qui a tout en stock",
  nearest: "Agence la plus proche ayant le stock",
};

export default function Settings() {
  const toast = useToast();
  const qc = useQueryClient();
  const methods = usePaymentMethods();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get("/settings/") });
  const [v, setV] = useState(null);
  useEffect(() => data && setV(data.values), [data]);
  if (!v) return <Skeleton h={400} />;
  const set = (k, numeric = true) => (e) => setV({ ...v, [k]: numeric ? Number(e.target.value) : e.target.value });
  const save = async () => {
    try {
      await patch("/settings/", v);
      toast.success("Paramètres enregistrés.");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e);
    }
  };
  const toggleMethod = async (m, key) => {
    await patch(`/payment-methods/${m.id}/`, { [key]: !m[key] });
    qc.invalidateQueries({ queryKey: ["ref", "methods"] });
  };
  return (
    <>
      <PageHead title="Paramètres" lead="Règles de gestion applicables à toutes les agences." actions={<button className="btn btn-action" onClick={save}><Save /> Enregistrer</button>} />
      <div className="grid-2">
        <Panel title="Devise et taux">
          <div className="stack">
            <Field label="Taux du jour : 1 USD =" hint="Utilisé pour consolider les montants en dollars (loyers, abonnements)">
              <input className="input num" type="number" value={v.usd_rate} onChange={set("usd_rate")} />
            </Field>
          </div>
        </Panel>
        <Panel title="Commandes clients">
          <div className="stack">
            <Field label="Affectation des commandes aux agences">
              <select className="select" value={v.order_assignment} onChange={set("order_assignment", false)}>
                {Object.entries(ASSIGN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Livraison en retard après (minutes)"><input className="input num" type="number" value={v.delivery_late_minutes} onChange={set("delivery_late_minutes")} /></Field>
            <Field label="Un point de fidélité tous les (FC)"><input className="input num" type="number" value={v.loyalty_points_per} onChange={set("loyalty_points_per")} /></Field>
          </div>
        </Panel>
        <Panel title="Contrôles et validations">
          <div className="stack">
            <Field label="Dépense à valider au-delà de (FC)"><input className="input num" type="number" value={v.expense_approval_threshold} onChange={set("expense_approval_threshold")} /></Field>
            <Field label="Alerte d'écart de caisse à partir de (FC)"><input className="input num" type="number" value={v.cash_difference_alert} onChange={set("cash_difference_alert")} /></Field>
            <Field label="Caisse non clôturée après (heures)"><input className="input num" type="number" value={v.session_max_hours} onChange={set("session_max_hours")} /></Field>
          </div>
        </Panel>
        <Panel title="Moyens de paiement" sub="Activez les moyens proposés en caisse et dans l'application">
          <table className="table">
            <thead><tr><th>Moyen</th><th>Caisse</th><th>Application</th></tr></thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id}>
                  <td className="strong small">{m.name} {m.requires_reference && <Pill plain>référence</Pill>}</td>
                  <td><label className="check"><input type="checkbox" checked={m.available_pos} onChange={() => toggleMethod(m, "available_pos")} /></label></td>
                  <td><label className="check"><input type="checkbox" checked={m.available_online} onChange={() => toggleMethod(m, "available_online")} /></label></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
