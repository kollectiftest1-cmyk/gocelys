import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { get, post } from "../api/client";
import { Field, PageHead, Panel, Skeleton, StatusPill } from "../components/ui";
import { useAuth } from "../lib/auth";
import { datetime, money, num } from "../lib/format";
import { SESSION_STATUS } from "../lib/status";
import { useToast } from "../lib/toast";

const NOTES = [20000, 10000, 5000, 1000, 500, 200, 100, 50];

export default function CashSessionDetail() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({ queryKey: ["session", id], queryFn: () => get(`/cash-sessions/${id}/`) });
  const [count, setCount] = useState({});
  const [justification, setJustification] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const counted = useMemo(() => NOTES.reduce((sum, n) => sum + n * Number(count[n] || 0), 0), [count]);

  if (isLoading || !s) return <Skeleton h={400} />;
  const f = s.figures;
  const diff = counted - Number(f.expected_cash);
  const mine = s.cashier === user.id;

  const close = async () => {
    setBusy(true);
    try {
      const r = await post(`/cash-sessions/${id}/close/`, { counted_cash: counted, count_detail: count, justification });
      qc.setQueryData(["session", id], r);
      qc.invalidateQueries({ queryKey: ["my-session"] });
      toast.success("Caisse clôturée.");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => {
    setBusy(true);
    try {
      qc.setQueryData(["session", id], await post(`/cash-sessions/${id}/validate/`, { note }));
      toast.success("Clôture validée.");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead crumb={[{ label: "Sessions de caisse", to: "/caisses" }, { label: s.reference }]}
        title={<span className="row" style={{ gap: 12 }}>{s.pos_name} · {s.agency_name} <StatusPill map={SESSION_STATUS} value={s.status} /></span>}
        lead={`${s.cashier_name} · ouverte le ${datetime(s.opened_at)}${s.closed_at ? ` · clôturée le ${datetime(s.closed_at)}` : ""}`} />

      <div className="grid-main-side">
        <div className="stack">
          <div className="stock-summary" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 0 }}>
            <div><span>Fonds initial</span><strong className="display-num">{money(f.opening_float)}</strong></div>
            <div><span>Ventes ({f.sales_count})</span><strong className="display-num">{money(f.sales_total)}</strong></div>
            <div><span>Sorties espèces</span><strong className="display-num">{money(f.cash_out)}</strong></div>
            <div><span>Solde théorique espèces</span><strong className="display-num">{money(f.expected_cash)}</strong></div>
          </div>
          <Panel title="Encaissements par moyen de paiement">
            <div className="stack-sm">
              {f.by_method.map((m) => (
                <div key={m.name} className="row-between small"><span>{m.name}</span><span className="num strong">{money(m.total)}</span></div>
              ))}
              {f.cancelled_count > 0 && <p className="xs faint">{f.cancelled_count} vente(s) annulée(s) sur la session.</p>}
            </div>
          </Panel>
          {s.status !== "open" && (
            <Panel title="Résultat du comptage">
              <dl className="kv">
                <dt>Solde théorique</dt><dd className="num">{money(s.expected_cash)}</dd>
                <dt>Montant compté</dt><dd className="num">{money(s.counted_cash)}</dd>
                <dt>Écart</dt>
                <dd className={`num strong ${Number(s.difference) < 0 ? "text-clay" : ""}`}>{Number(s.difference) > 0 ? "+" : ""}{money(s.difference)}</dd>
                {s.justification && (<><dt>Justification</dt><dd style={{ whiteSpace: "pre-line" }}>{s.justification}</dd></>)}
                {s.validated_by_name && (<><dt>Validée par</dt><dd>{s.validated_by_name} · {datetime(s.validated_at)}</dd></>)}
              </dl>
            </Panel>
          )}
        </div>

        <div className="stack">
          {s.status === "open" && (mine || can("cash.validate")) && (
            <Panel title="Clôturer la caisse" sub="Comptez les billets et pièces présents dans le tiroir">
              <div className="stack-sm">
                {NOTES.map((n) => (
                  <div key={n} className="row-between small">
                    <span className="num" style={{ width: 80 }}>{num(n)} FC</span>
                    <input className="input num" type="number" min="0" style={{ width: 90, height: 34 }} value={count[n] || ""} placeholder="0"
                      onChange={(e) => setCount({ ...count, [n]: e.target.value })} aria-label={`Nombre de ${n}`} />
                    <span className="num faint" style={{ width: 110, textAlign: "right" }}>{money(n * Number(count[n] || 0))}</span>
                  </div>
                ))}
                <div className="divider" style={{ margin: "8px 0" }} />
                <div className="row-between strong"><span>Total compté</span><span className="num">{money(counted)}</span></div>
                <div className={`callout ${diff === 0 ? "" : diff < 0 ? "danger" : "warn"}`}>
                  {diff === 0 ? <CheckCircle2 /> : <AlertTriangle />}
                  <span>{diff === 0 ? "Aucun écart avec le solde théorique." : `Écart de ${diff > 0 ? "+" : ""}${money(diff)}. Une justification est obligatoire.`}</span>
                </div>
                {diff !== 0 && (
                  <Field label="Justification">
                    <textarea className="textarea" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Erreur de rendu monnaie, billet refusé…" />
                  </Field>
                )}
                <button className="btn btn-action" disabled={busy || (diff !== 0 && !justification)} onClick={close}><Lock /> Clôturer la session</button>
              </div>
            </Panel>
          )}
          {s.status === "closed" && can("cash.validate") && (
            <Panel title="Valider la clôture" sub="Contrôle du responsable">
              <div className="stack-sm">
                <Field label="Commentaire (facultatif)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <button className="btn btn-primary" disabled={busy} onClick={validate}><CheckCircle2 /> Valider</button>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
