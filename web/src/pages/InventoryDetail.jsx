import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { get, post } from "../api/client";
import { PageHead, Panel, Skeleton, StatusPill } from "../components/ui";
import { useAuth } from "../lib/auth";
import { datetime, num } from "../lib/format";
import { INVENTORY_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";

export default function InventoryDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: inv, isLoading } = useQuery({ queryKey: ["inventory", id], queryFn: () => get(`/inventories/${id}/`) });
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (inv) setCounts(Object.fromEntries(inv.lines.map((l) => [l.id, l.counted ?? ""])));
  }, [inv?.id, inv?.status]); // eslint-disable-line

  if (isLoading || !inv) return <Skeleton h={400} />;
  const editable = inv.status === "draft";

  const call = async (action, body, msg) => {
    setBusy(true);
    try {
      qc.setQueryData(["inventory", id], await post(`/inventories/${id}/${action}/`, body));
      qc.invalidateQueries({ queryKey: ["/inventories/"] });
      toast.success(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const save = () => call("count", { lines: inv.lines.map((l) => ({ id: l.id, counted: counts[l.id] })) }, "Comptage enregistré.");
  const gaps = inv.lines.map((l) => (counts[l.id] === "" || counts[l.id] === null ? null : Number(counts[l.id]) - Number(l.expected)));

  return (
    <>
      <PageHead crumb={[{ label: "Inventaires", to: "/inventaires" }, { label: inv.reference }]}
        title={<span className="row" style={{ gap: 12 }}>{inv.agency_name} <StatusPill map={INVENTORY_STATUS} value={inv.status} /></span>}
        lead={`${inv.scope_note || "Tous les produits"} · ouvert le ${datetime(inv.created_at)} par ${inv.created_by_name}`}
        actions={<>
          {editable && can("inventory.manage") && <button className="btn" disabled={busy} onClick={save}><Save /> Enregistrer</button>}
          {editable && can("inventory.manage") && <button className="btn btn-primary" disabled={busy} onClick={async () => { await save(); call("submit", {}, "Inventaire soumis pour validation."); }}><Send /> Soumettre</button>}
          {inv.status === "submitted" && can("inventory.validate") && <button className="btn btn-action" disabled={busy} onClick={() => call("validate", {}, "Inventaire validé : le stock est ajusté.")}><CheckCircle2 /> Valider et ajuster le stock</button>}
        </>} />
      <Panel flush title="Comptage" sub={`${inv.progress.counted} sur ${inv.progress.total} produits comptés`}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Produit</th><th className="num">Stock théorique</th><th className="num">Compté</th><th className="num">Écart</th></tr></thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={l.id}>
                  <td><div className="cell-main">{l.product_name}</div><div className="cell-sub">{l.product_code} · en {l.unit.toLowerCase()}s</div></td>
                  <td className="num">{num(l.expected)}</td>
                  <td className="num">
                    {editable ? (
                      <input className="input num" type="number" min="0" style={{ width: 110, height: 34, textAlign: "right" }} value={counts[l.id] ?? ""}
                        onChange={(e) => setCounts({ ...counts, [l.id]: e.target.value })} aria-label={`Quantité comptée ${l.product_name}`} />
                    ) : num(l.counted)}
                  </td>
                  <td className={`num strong ${gaps[i] < 0 ? "text-clay" : gaps[i] > 0 ? "text-amber" : ""}`}>
                    {gaps[i] === null ? "—" : gaps[i] === 0 ? "0" : `${gaps[i] > 0 ? "+" : ""}${num(gaps[i])}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
