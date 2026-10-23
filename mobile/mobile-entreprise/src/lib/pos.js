/** État local de la caisse : session, ventes, stock affiché. Fonctionne sans réseau. */
import { enqueue, kvGet, kvSet, saveLocalSale, sessionSales } from "./db";
import { uuid } from "./uuid";

export const currentSession = () => kvGet("pos.session");

export function openSession({ pos, opening_float, user }) {
  const catalog = kvGet("catalog") || {};
  const session = {
    session_uuid: uuid(),
    pos: pos.id,
    pos_name: pos.name,
    agency: pos.agency || catalog.agency,
    opened_at: new Date().toISOString(),
    opening_float: Number(opening_float || 0),
    cashier: user?.full_name,
  };
  enqueue(uuid(), "session.open", { pos: pos.id, opening_float: session.opening_float, session_uuid: session.session_uuid }, session.opened_at);
  kvSet("pos.session", session);
  return session;
}

/** Ticket local lisible tant que le serveur n'a pas attribué sa référence. */
function localRef() {
  const n = (kvGet("pos.counter") || 0) + 1;
  kvSet("pos.counter", n);
  const d = new Date();
  return `HL-${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(n).padStart(4, "0")}`;
}

export function recordSale({ cart, method, received, reference, discount = 0 }) {
  const session = currentSession();
  if (!session) throw new Error("Ouvrez la caisse avant d'encaisser.");
  const subtotal = cart.reduce((s, l) => s + Number(l.unit.current_price) * l.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));
  const paid = method.kind === "cash" ? Math.max(Number(received || total), total) : total;
  const sale = {
    client_uuid: uuid(),
    local_ref: localRef(),
    session_uuid: session.session_uuid,
    created_at: new Date().toISOString(),
    lines: cart.map((l) => ({ product_unit: l.unit.id, quantity: l.quantity, label: `${l.product.name}${Number(l.unit.factor) > 1 ? ` — ${l.unit.unit_name}` : ""}`, price: Number(l.unit.current_price) })),
    subtotal,
    discount: Number(discount || 0),
    total,
    paid,
    change: paid - total,
    method: { id: method.id, name: method.name, kind: method.kind },
    reference: reference || "",
    cash: method.kind === "cash" ? total : 0,
  };
  saveLocalSale(sale);
  enqueue(uuid(), "sale.create", {
    session_uuid: session.session_uuid,
    pos: session.pos,
    client_uuid: sale.client_uuid,
    offline_reference: sale.local_ref,
    lines: sale.lines.map(({ product_unit, quantity }) => ({ product_unit, quantity })),
    payments: [{ method: method.id, amount: paid, reference: sale.reference }],
    discount: sale.discount,
  }, sale.created_at);
  // Stock affiché : décrément immédiat, recalé à la prochaine synchronisation.
  const catalog = kvGet("catalog");
  if (catalog?.stock) {
    for (const l of cart) {
      const id = l.product.id;
      catalog.stock[id] = (catalog.stock[id] || 0) - Number(l.unit.factor) * l.quantity;
    }
    kvSet("catalog", catalog);
  }
  return sale;
}

export function sessionSummary() {
  const session = currentSession();
  if (!session) return null;
  const sales = sessionSales(session.session_uuid);
  const cash = sales.reduce((s, x) => s + x.cash, 0);
  const total = sales.reduce((s, x) => s + x.total, 0);
  const byMethod = {};
  for (const s of sales) {
    const m = s.payload.method.name;
    byMethod[m] = (byMethod[m] || 0) + s.total;
  }
  return {
    session,
    sales,
    count: sales.length,
    total,
    expected_cash: session.opening_float + cash,
    by_method: byMethod,
    pending: sales.filter((s) => s.status === "pending").length,
    rejected: sales.filter((s) => s.status === "rejected").length,
  };
}

export function closeSession({ counted_cash, count_detail, justification }) {
  const session = currentSession();
  if (!session) return null;
  const summary = sessionSummary();
  enqueue(uuid(), "session.close", {
    session_uuid: session.session_uuid,
    pos: session.pos,
    counted_cash: Number(counted_cash || 0),
    count_detail,
    justification: justification || "",
  });
  kvSet("pos.last_closed", { ...summary, counted_cash: Number(counted_cash || 0), closed_at: new Date().toISOString(), sales: undefined });
  kvSet("pos.session", null);
  return summary;
}
