import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Barcode, CheckCircle2, Minus, Plus, Printer, Search, Smartphone, Trash2, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { get, post } from "../api/client";
import { Empty, Field, Modal, Skeleton } from "../components/ui";
import { useCategories } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { datetime, money, num } from "../lib/format";
import { useToast } from "../lib/toast";
import "./pos.css";

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function OpenSession({ onOpened }) {
  const { user, can } = useAuth();
  const toast = useToast();
  const mine = user?.assigned_pos;
  const manager = can("cash.validate");
  const [pos, setPos] = useState(mine?.id || "");
  const { data: list } = useQuery({
    queryKey: ["pos-list", user?.default_agency], enabled: manager && !mine,
    queryFn: () => get("/pos/", user?.default_agency ? { agency: user.default_agency } : {}),
  });
  const chosen = mine || (list || []).find((p) => String(p.id) === String(pos));
  const [float, setFloat] = useState("");
  useEffect(() => {
    if (chosen) setFloat(String(Math.round(Number(chosen.default_float || 0))));
  }, [chosen?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async () => {
    try {
      onOpened(await post("/cash-sessions/open/", { pos: mine ? undefined : pos, opening_float: float === "" ? undefined : float }));
      toast.success("Caisse ouverte. Bonnes ventes !");
    } catch (e) {
      toast.error(e);
    }
  };
  if (!mine && !manager) {
    return (
      <div className="pos-open">
        <div className="pos-open-card">
          <WalletCards size={36} color="var(--brand-500)" />
          <h2>Aucune caisse affectée</h2>
          <p className="muted small">Votre compte n'est rattaché à aucune caisse. Demandez à votre responsable de vous affecter une caisse dans <strong>Utilisateurs et rôles</strong>.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="pos-open">
      <div className="pos-open-card">
        <WalletCards size={36} color="var(--brand-500)" />
        <h2>Ouvrir la caisse</h2>
        {mine ? (
          <div className="pos-assigned">
            <span className="xs faint">Votre caisse</span>
            <strong>{mine.name}</strong>
            <span className="small muted">{mine.agency_name}</span>
          </div>
        ) : (
          <Field label="Caisse à ouvrir" hint="En tant que responsable, vous pouvez ouvrir n'importe quelle caisse de votre agence (remplacement).">
            <select className="select" value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="">Choisir…</option>
              {(list || []).filter((p) => p.is_active).map((p) => (
                <option key={p.id} value={p.id} disabled={Boolean(p.open_session)}>
                  {p.agency_name} · {p.name}{p.open_session ? ` — ouverte par ${p.open_session.cashier}` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Fonds de caisse (FC)" hint="La monnaie présente dans le tiroir avant la première vente : comptez-la et corrigez si besoin.">
          <input className="input num" type="number" min="0" value={float} onChange={(e) => setFloat(e.target.value)} />
        </Field>
        <button className="btn btn-action" style={{ height: 46 }} disabled={!chosen} onClick={open}>Ouvrir la caisse</button>
      </div>
    </div>
  );
}

function Receipt({ sale, onClose }) {
  if (!sale) return null;
  return (
    <Modal open onClose={onClose} title={<span className="row" style={{ gap: 8 }}><CheckCircle2 color="var(--leaf-500)" /> Vente encaissée</span>}
      footer={<>
        <button className="btn" onClick={() => window.print()}><Printer /> Imprimer le ticket</button>
        <button className="btn btn-action" onClick={onClose} autoFocus>Vente suivante</button>
      </>}>
      <div className="receipt" id="receipt">
        <div className="receipt-head">
          <strong>Gocelsys · {sale.agency_name}</strong>
          <span>{sale.pos_name} · {datetime(sale.occurred_at)}</span>
          <span>Ticket {sale.reference}</span>
        </div>
        {sale.lines.map((l) => (
          <div key={l.id} className="receipt-line">
            <span>{num(l.quantity)} × {l.label}</span>
            <span>{money(l.total)}</span>
          </div>
        ))}
        {Number(sale.discount) > 0 && <div className="receipt-line"><span>Remise</span><span>− {money(sale.discount)}</span></div>}
        <div className="receipt-line total"><span>Total</span><span>{money(sale.total)}</span></div>
        {sale.payments.map((p) => <div key={p.id} className="receipt-line"><span>{p.method_name}</span><span>{money(p.amount)}</span></div>)}
        {Number(sale.change_due) > 0 && <div className="receipt-line strong"><span>Monnaie rendue</span><span>{money(sale.change_due)}</span></div>}
        <div className="receipt-foot">Merci de votre confiance. Servi par {sale.cashier_name}.</div>
      </div>
    </Modal>
  );
}

export default function Pos() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useCategories();
  const { data: session, isLoading, refetch } = useQuery({ queryKey: ["my-session"], queryFn: () => get("/cash-sessions/current/") });
  const { data: ref } = useQuery({
    queryKey: ["pos-ref", session?.agency], enabled: Boolean(session?.agency),
    queryFn: () => get("/sync/pull/", { agency: session.agency }),
  });
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [method, setMethod] = useState(null);
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const searchRef = useRef(null);

  const methods = ref?.payment_methods || [];
  useEffect(() => {
    if (!method && methods.length) setMethod(methods[0]);
  }, [methods]); // eslint-disable-line

  const products = useMemo(() => {
    const list = ref?.products || [];
    const s = search.trim().toLowerCase();
    return list.filter((p) => (!cat || p.category === Number(cat)) && (!s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || p.barcode === s || p.units.some((u) => u.barcode === s)));
  }, [ref, cat, search]);

  const add = (product, unit) => {
    unit = unit || product.units.find((u) => u.is_default) || product.units[0];
    setCart((c) => {
      const i = c.findIndex((l) => l.unit.id === unit.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { product, unit, quantity: 1 }];
    });
  };

  const onScan = (e) => {
    e.preventDefault();
    const code = search.trim();
    for (const p of ref?.products || []) {
      const u = p.units.find((x) => x.barcode === code) || (p.barcode === code ? p.units[0] : null);
      if (u) {
        add(p, u);
        setSearch("");
        return;
      }
    }
    if (products.length === 1) {
      add(products[0]);
      setSearch("");
    }
  };

  const subtotal = cart.reduce((s, l) => s + Number(l.unit.current_price) * l.quantity, 0);
  const disc = Math.min(Number(discount || 0), subtotal);
  const total = subtotal - disc;
  const paid = method?.kind === "cash" ? Number(received || total) : total;
  const change = method?.kind === "cash" ? Math.max(0, paid - total) : 0;
  const quick = [total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000, Math.ceil(total / 20000) * 20000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);

  const checkout = async () => {
    if (!cart.length) return;
    if (method?.requires_reference && !reference) return toast.error(`Saisissez la référence ${method.name}.`);
    if (paid < total) return toast.error("Le montant reçu est inférieur au total.");
    setBusy(true);
    try {
      const sale = await post("/sales/", {
        session: session.id, client_uuid: uuid(),
        lines: cart.map((l) => ({ product_unit: l.unit.id, quantity: l.quantity })),
        payments: [{ method: method.id, amount: paid, reference }],
        discount: disc, discount_reason: disc ? "Remise caisse" : "",
      });
      setDone(sale);
      setCart([]);
      setReceived("");
      setReference("");
      setDiscount("");
      qc.invalidateQueries({ queryKey: ["pos-ref"] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton h={500} />;
  if (!session) return <OpenSession onOpened={() => refetch()} />;

  const stock = ref?.stock || {};
  return (
    <div className="pos">
      <section className="pos-catalog">
        <div className="pos-top">
          <form onSubmit={onScan} className="input-group grow">
            <Barcode />
            <input ref={searchRef} className="input" autoFocus placeholder="Scanner un code-barres ou chercher un produit" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <Link to={`/caisses/${session.id}`} className="btn">Clôturer la caisse</Link>
        </div>
        <div className="pos-cats">
          <button className={!cat ? "active" : ""} onClick={() => setCat("")}>Tout</button>
          {categories.map((c) => <button key={c.id} className={String(cat) === String(c.id) ? "active" : ""} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
        {!ref ? <Skeleton h={300} /> : products.length === 0 ? <Empty icon={Search} title="Aucun produit" /> : (
          <div className="pos-grid">
            {products.map((p) => {
              const s = stock[p.id] ?? 0;
              return (
                <div key={p.id} className={`pos-item ${s <= 0 ? "out" : ""}`} style={{ "--accent": p.accent || "#22C3E6" }}>
                  <button className="pos-item-main" onClick={() => add(p)}>
                    {p.image
                      ? <span className={`pos-thumb ${p.image_cutout ? "cut" : ""}`}><img src={p.image} alt="" loading="lazy" /></span>
                      : <span className="pos-swatch" />}
                    <span className="pos-name">{p.name}</span>
                    <span className="pos-price num">{money(p.current_price)}</span>
                    <span className={`pos-stock ${s <= Number(p.min_stock) ? "low" : ""}`}>{s <= 0 ? "Rupture" : `${num(s)} en stock`}</span>
                  </button>
                  {p.units.length > 1 && (
                    <div className="pos-units">
                      {p.units.filter((u) => Number(u.factor) > 1).map((u) => (
                        <button key={u.id} onClick={() => add(p, u)} title={`${u.unit_name} de ${num(u.factor)}`}>
                          {u.unit_name} ×{num(u.factor)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <aside className="pos-ticket">
        <div className="pos-ticket-head">
          <div>
            <strong>{session.pos_name}</strong>
            <div className="xs faint">{session.agency_name} · ouverte à {new Date(session.opened_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          {cart.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}><X /> Vider</button>}
        </div>
        <div className="pos-lines">
          {cart.length === 0 ? (
            <div className="pos-empty">
              <Barcode size={30} />
              <span>Scannez ou touchez un produit</span>
            </div>
          ) : (
            cart.map((l, i) => (
              <div key={l.unit.id} className="pos-line">
                <div className="grow">
                  <div className="strong small">{l.product.name}</div>
                  <div className="xs faint">{l.unit.unit_name}{Number(l.unit.factor) > 1 ? ` de ${num(l.unit.factor)}` : ""} · {money(l.unit.current_price)}</div>
                </div>
                <div className="qty">
                  <button onClick={() => setCart(cart.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))} aria-label="Moins"><Minus /></button>
                  <span className="num">{l.quantity}</span>
                  <button onClick={() => setCart(cart.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x)))} aria-label="Plus"><Plus /></button>
                </div>
                <span className="num strong small line-amount">{money(Number(l.unit.current_price) * l.quantity)}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCart(cart.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 /></button>
              </div>
            ))
          )}
        </div>
        <div className="pos-pay">
          <div className="row-between small"><span className="muted">Sous-total</span><span className="num">{money(subtotal)}</span></div>
          {can("sales.discount") && (
            <div className="row-between small">
              <span className="muted">Remise</span>
              <input className="input num" style={{ width: 120, height: 32, textAlign: "right" }} type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </div>
          )}
          <div className="pos-total"><span>À payer</span><span className="num">{money(total)}</span></div>
          <div className="pos-methods">
            {methods.map((m) => (
              <button key={m.id} className={method?.id === m.id ? "active" : ""} onClick={() => setMethod(m)}>
                {m.kind === "cash" ? <Banknote /> : <Smartphone />}
                {m.name}
              </button>
            ))}
          </div>
          {method?.kind === "cash" ? (
            <>
              <div className="pos-quick">
                {quick.map((v) => <button key={v} className={Number(received) === v ? "active" : ""} onClick={() => setReceived(String(v))}>{num(v)}</button>)}
              </div>
              <div className="row-between small">
                <span className="muted">Reçu</span>
                <input className="input num" style={{ width: 150, height: 34, textAlign: "right" }} type="number" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={num(total)} />
              </div>
              {change > 0 && <div className="row-between pos-change"><span>Monnaie à rendre</span><span className="num">{money(change)}</span></div>}
            </>
          ) : method ? (
            <input className="input" placeholder={`Référence ${method.name}`} value={reference} onChange={(e) => setReference(e.target.value)} />
          ) : null}
          <button className="btn btn-action pos-checkout" disabled={!cart.length || busy} onClick={checkout}>
            {busy ? "Encaissement…" : `Encaisser ${money(total)}`}
          </button>
        </div>
      </aside>
      <Receipt sale={done} onClose={() => { setDone(null); searchRef.current?.focus(); }} />
    </div>
  );
}
