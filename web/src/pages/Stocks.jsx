import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Factory, PackageMinus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api, get } from "../api/client";
import { Drawer, Empty, Field, LoadingRows, PageHead, Pager, Pill, Segmented, Tabs } from "../components/ui";
import { LevelBar, WaterLevel } from "../components/WaterLevel";
import { useDebounced, useList } from "../hooks/useList";
import { useAgencies, useCategories, useProducts } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { datetime, moneyShort, num } from "../lib/format";
import { MOVEMENT_TONE } from "../lib/status";
import { useToast } from "../lib/toast";
import { useWorkspace } from "../lib/workspace";
import "./stocks.css";

const STATES = [
  { value: "", label: "Tous" },
  { value: "low", label: "Sous le seuil" },
  { value: "out", label: "Ruptures" },
];

function Matrix({ rows }) {
  const agencies = [];
  const products = [];
  const cells = {};
  for (const r of rows) {
    if (!agencies.find((a) => a.id === r.agency)) agencies.push({ id: r.agency, code: r.agency_code, name: r.agency_name });
    if (!products.find((p) => p.id === r.product)) products.push({ id: r.product, name: r.product_name, code: r.product_code, unit: r.unit, category: r.category });
    cells[`${r.product}:${r.agency}`] = r;
  }
  return (
    <div className="table-wrap">
      <table className="table matrix">
        <thead>
          <tr>
            <th>Produit</th>
            {agencies.map((a) => <th key={a.id} className="num" title={a.name}>{a.code}<div className="xs faint" style={{ fontWeight: 500 }}>{a.name}</div></th>)}
            <th className="num">Réseau</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const total = agencies.reduce((s, a) => s + (cells[`${p.id}:${a.id}`]?.available || 0), 0);
            return (
              <tr key={p.id}>
                <td>
                  <div className="cell-main">{p.name}</div>
                  <div className="cell-sub">{p.category} · en {p.unit.toLowerCase()}s</div>
                </td>
                {agencies.map((a) => {
                  const c = cells[`${p.id}:${a.id}`];
                  if (!c) return <td key={a.id} />;
                  return (
                    <td key={a.id} className="num">
                      <div className={`mx-cell lvl-${c.level}`} title={`Disponible ${num(c.available)} · réservé ${num(c.reserved)} · en transfert ${num(c.in_transit)} · seuil ${num(c.min_stock)}`}>
                        <WaterLevel value={c.available} min={c.min_stock} max={c.max_stock} height={30} width={14} />
                        <span>
                          <strong>{num(c.available)}</strong>
                          {c.reserved > 0 && <em>{num(c.reserved)} rés.</em>}
                          {c.in_transit > 0 && <em>{num(c.in_transit)} en route</em>}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="num strong">{num(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgencyTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40 }} />
            <th>Produit</th>
            <th style={{ width: "22%" }}>Niveau</th>
            <th className="num">Disponible</th>
            <th className="num">Réservé</th>
            <th className="num">En transfert</th>
            <th className="num">Endommagé</th>
            <th className="num">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.agency}-${r.product}`}>
              <td><WaterLevel value={r.available} min={r.min_stock} max={r.max_stock} height={34} width={16} /></td>
              <td>
                <div className="cell-main">{r.product_name}</div>
                <div className="cell-sub">{r.category} · seuil {num(r.min_stock)} {r.unit.toLowerCase()}s</div>
              </td>
              <td><LevelBar value={r.available} min={r.min_stock} max={r.max_stock} /></td>
              <td className="num">
                <strong className={r.level === "out" ? "text-clay" : ""}>{num(r.available)}</strong>
                {r.level !== "ok" && <div><Pill tone={r.level === "out" ? "clay" : "amber"} plain>{r.level === "out" ? "Rupture" : "Sous le seuil"}</Pill></div>}
              </td>
              <td className="num muted">{r.reserved ? num(r.reserved) : "—"}</td>
              <td className="num muted">{r.in_transit ? num(r.in_transit) : "—"}</td>
              <td className="num muted">{r.damaged ? num(r.damaged) : "—"}</td>
              <td className="num">{moneyShort(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Levels() {
  const [sp] = useSearchParams();
  const { params, agency } = useWorkspace();
  const categories = useCategories();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState(sp.get("state") || "");
  const q = useDebounced(search);
  const { data, isLoading } = useQuery({
    queryKey: ["stock-levels", params, q, category, state],
    queryFn: () => get("/stock/levels/", { ...params, search: q, category, state }),
  });
  const rows = data?.results || [];
  const s = data?.summary;
  return (
    <>
      {s && (
        <div className="stock-summary">
          <div><span>Valeur du stock disponible</span><strong className="display-num">{moneyShort(s.value)}</strong></div>
          <div><span>Ruptures</span><strong className={`display-num ${s.out ? "text-clay" : ""}`}>{s.out}</strong></div>
          <div><span>Sous le seuil minimum</span><strong className="display-num">{s.low}</strong></div>
          <div><span>Unités réservées (commandes)</span><strong className="display-num">{num(s.reserved)}</strong></div>
          <div><span>Unités en transfert</span><strong className="display-num">{num(s.in_transit)}</strong></div>
        </div>
      )}
      <section className="panel">
        <div className="toolbar">
          <div className="input-group">
            <Search />
            <input className="input" placeholder="Produit ou code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Segmented options={STATES} value={state} onChange={setState} />
          <span className="grow" />
          <span className="xs faint row" style={{ gap: 6 }}>
            <svg width="18" height="2"><line x1="0" y1="1" x2="18" y2="1" stroke="#14123A" strokeDasharray="2 2" /></svg> seuil minimum
          </span>
        </div>
        {isLoading ? <LoadingRows /> : rows.length === 0 ? (
          <Empty icon={Boxes} title="Aucun produit ne correspond">Modifiez les filtres.</Empty>
        ) : agency ? <AgencyTable rows={rows} /> : state ? <AgencyTable rows={rows} /> : <Matrix rows={rows} />}
      </section>
    </>
  );
}

function Movements() {
  const { params } = useWorkspace();
  const products = useProducts();
  const [product, setProduct] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const list = useList("/stock/movements/", { ...params, product, kind, search: q, bucket: "available" });
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="input-group">
          <Search />
          <input className="input" placeholder="Référence, motif" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">Tous les produits</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tous les mouvements</option>
          {[["sale", "Ventes"], ["order_out", "Sorties commande"], ["production", "Production"], ["transfer_out", "Transferts sortants"], ["transfer_in", "Transferts entrants"], ["loss", "Pertes"], ["damage", "Détériorations"], ["inventory", "Inventaires"], ["correction", "Corrections"], ["reservation", "Réservations"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty title="Aucun mouvement" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Produit</th>
                <th>Agence</th>
                <th>Mouvement</th>
                <th className="num">Avant</th>
                <th className="num">Variation</th>
                <th className="num">Après</th>
                <th>Par</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap small">{datetime(m.occurred_at)}<div className="cell-sub">{m.reference}</div></td>
                  <td className="cell-main">{m.product_name}</td>
                  <td className="small">{m.agency_name}</td>
                  <td><Pill tone={MOVEMENT_TONE[m.kind]} plain>{m.kind_label}</Pill>{m.reason && <div className="cell-sub truncate" style={{ maxWidth: 220 }}>{m.reason}</div>}</td>
                  <td className="num muted">{num(m.balance_before)}</td>
                  <td className={`num strong ${m.quantity < 0 ? "text-clay" : "text-leaf"}`}>{m.quantity > 0 ? "+" : ""}{num(m.quantity)}</td>
                  <td className="num">{num(m.balance_after)}</td>
                  <td className="small muted">{m.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} count={list.count} onPage={list.setPage} />
    </section>
  );
}

const OPS = {
  production: { label: "Entrée de production", icon: Factory, hint: "Quantité produite ou reçue au dépôt", qty: "Quantité reçue" },
  loss: { label: "Perte", icon: PackageMinus, hint: "Produit perdu, volé ou manquant", qty: "Quantité perdue" },
  damage: { label: "Détérioration", icon: PackageMinus, hint: "Produit abîmé, invendable", qty: "Quantité endommagée" },
  adjust: { label: "Correction de stock", icon: SlidersHorizontal, hint: "Saisissez la nouvelle quantité réelle. Une correction importante demande une validation.", qty: "Nouvelle quantité disponible" },
};

function OperationDrawer({ open, onClose }) {
  const { agency } = useWorkspace();
  const agencies = useAgencies().filter((a) => a.status !== "closed");
  const products = useProducts();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: "production", agency: agency || "", product: "", quantity: "", reason: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });
  const op = OPS[form.type];
  const submit = async () => {
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      if (file) body.append("attachment", file);
      const r = await api.post("/stock/operations/", body);
      toast.success(`${op.label} enregistrée. Disponible : ${num(r.data.available)}.`);
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["/stock/movements/"] });
      setForm({ ...form, quantity: "", reason: "" });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Opération de stock" sub="Chaque opération est tracée dans le registre et le journal"
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" disabled={busy || !form.product || !form.agency || form.quantity === ""} onClick={submit}>Enregistrer</button></>}>
      <div className="stack">
        <div className="op-choice">
          {Object.entries(OPS).map(([k, o]) => (
            <button key={k} type="button" className={form.type === k ? "active" : ""} onClick={() => setForm({ ...form, type: k })}>
              <o.icon />
              {o.label}
            </button>
          ))}
        </div>
        <p className="small muted">{op.hint}</p>
        <Field label="Agence">
          <select className="select" value={form.agency} onChange={set("agency")}>
            <option value="">Choisir…</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Produit">
          <select className="select" value={form.product} onChange={set("product")}>
            <option value="">Choisir…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.base_unit_name.toLowerCase()})</option>)}
          </select>
        </Field>
        <Field label={op.qty} hint="En unité de stock (bouteille, sachet, sac…)">
          <input className="input num" type="number" min="0" value={form.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Motif">
          <textarea className="textarea" value={form.reason} onChange={set("reason")} placeholder="Ex. pack percé au déchargement" />
        </Field>
        {form.type !== "production" && (
          <Field label="Justificatif (photo, PV)" hint="Facultatif">
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0])} />
          </Field>
        )}
      </div>
    </Drawer>
  );
}

export default function Stocks() {
  const { can } = useAuth();
  const [tab, setTab] = useState("levels");
  const [op, setOp] = useState(false);
  const tabs = useMemo(() => [{ value: "levels", label: "Niveaux par agence" }, { value: "movements", label: "Registre des mouvements" }], []);
  return (
    <>
      <PageHead
        title="Stocks"
        lead="Le stock est calculé à partir des mouvements validés. Une correction ne supprime jamais l'historique."
        actions={can("stock.adjust", "stock.loss") && <button className="btn btn-action" onClick={() => setOp(true)}><SlidersHorizontal /> Opération de stock</button>}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "levels" ? <Levels /> : <Movements />}
      <OperationDrawer open={op} onClose={() => setOp(false)} />
    </>
  );
}
