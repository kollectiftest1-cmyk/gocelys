import { WalletCards } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Empty, LoadingRows, PageHead, Pager, StatusPill } from "../components/ui";
import { useList } from "../hooks/useList";
import { datetime, money, time } from "../lib/format";
import { SESSION_STATUS } from "../lib/status";
import { useWorkspace } from "../lib/workspace";

export default function CashSessions() {
  const navigate = useNavigate();
  const { params } = useWorkspace();
  const [status, setStatus] = useState("");
  const list = useList("/cash-sessions/", { ...params, status });
  return (
    <>
      <PageHead title="Sessions de caisse" lead="Ouverture, encaissements, comptage et contrôle des écarts pour chaque poste de vente." />
      <section className="panel">
        <div className="toolbar">
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Toutes les sessions</option>
            <option value="open">Ouvertes</option>
            <option value="closed">Clôturées, à valider</option>
            <option value="validated">Validées</option>
          </select>
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty icon={WalletCards} title="Aucune session" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Session</th><th>Poste</th><th>Caissier</th><th>Ouverture</th><th>Clôture</th><th className="num">Théorique</th><th className="num">Compté</th><th className="num">Écart</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {list.rows.map((s) => {
                  const diff = Number(s.difference || 0);
                  return (
                    <tr key={s.id} className="clickable" onClick={() => navigate(`/caisses/${s.id}`)}>
                      <td className="cell-main">{s.reference}</td>
                      <td className="small">{s.pos_name}<div className="cell-sub">{s.agency_name}</div></td>
                      <td className="small">{s.cashier_name}</td>
                      <td className="small nowrap">{datetime(s.opened_at)}</td>
                      <td className="small nowrap">{s.closed_at ? time(s.closed_at) : "—"}</td>
                      <td className="num">{s.expected_cash !== null ? money(s.expected_cash) : "—"}</td>
                      <td className="num">{s.counted_cash !== null ? money(s.counted_cash) : "—"}</td>
                      <td className={`num strong ${diff < 0 ? "text-clay" : diff > 0 ? "text-amber" : ""}`}>{s.difference !== null ? (diff === 0 ? "0" : `${diff > 0 ? "+" : ""}${money(diff)}`) : "—"}</td>
                      <td><StatusPill map={SESSION_STATUS} value={s.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
    </>
  );
}
