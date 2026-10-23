/**
 * Variante web de la base locale (aperçu navigateur) : même interface que db.js,
 * stockée dans localStorage. Sur Android et iOS, c'est SQLite (db.js) qui est utilisé.
 */
const KEY = "gocelsys.entreprise.store";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { kv: {}, outbox: [], sales: [] };
  } catch {
    return { kv: {}, outbox: [], sales: [] };
  }
}
let store = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota ou stockage indisponible : on reste en mémoire */
  }
}

export const getDb = () => store;

export function kvGet(key, fallback = null) {
  return key in store.kv ? store.kv[key] : fallback;
}

export function kvSet(key, value) {
  if (value === null || value === undefined) delete store.kv[key];
  else store.kv[key] = value;
  save();
}

export function enqueue(op_id, type, payload, occurred_at = new Date().toISOString()) {
  const seq = store.outbox.reduce((m, o) => Math.max(m, o.seq), 0) + 1;
  store.outbox.push({ op_id, seq, type, payload, occurred_at, status: "pending", attempts: 0, error: null, result: null });
  save();
}

export const pendingOps = (limit = 100) => store.outbox.filter((o) => o.status === "pending").sort((a, b) => a.seq - b.seq).slice(0, limit);

export function outboxCounts() {
  const counts = {};
  for (const o of store.outbox) counts[o.status] = (counts[o.status] || 0) + 1;
  return counts;
}

export const rejectedOps = () => store.outbox.filter((o) => o.status === "rejected").reverse().slice(0, 50);

export function markOp(op_id, status, { error = null, result = null } = {}) {
  const o = store.outbox.find((x) => x.op_id === op_id);
  if (o) Object.assign(o, { status, error, result: result ? JSON.stringify(result) : null, attempts: o.attempts + 1 });
  save();
}

export function bumpAttempt(op_id, error) {
  const o = store.outbox.find((x) => x.op_id === op_id);
  if (o) Object.assign(o, { error, attempts: o.attempts + 1 });
  save();
}

export function saveLocalSale(sale) {
  store.sales = store.sales.filter((s) => s.client_uuid !== sale.client_uuid);
  store.sales.push({ client_uuid: sale.client_uuid, local_ref: sale.local_ref, session_uuid: sale.session_uuid, total: sale.total, cash: sale.cash, payload: sale, server_ref: null, status: "pending", created_at: sale.created_at });
  save();
}

export function markSale(client_uuid, status, server_ref = null) {
  const s = store.sales.find((x) => x.client_uuid === client_uuid);
  if (s) Object.assign(s, { status, server_ref: server_ref || s.server_ref });
  save();
}

export const sessionSales = (session_uuid) =>
  store.sales.filter((s) => s.session_uuid === session_uuid).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

export function purgeDone(days = 14) {
  const limit = new Date(Date.now() - days * 86400000).toISOString();
  store.outbox = store.outbox.filter((o) => !(["applied", "duplicate"].includes(o.status) && o.occurred_at < limit));
  store.sales = store.sales.filter((s) => !(s.status === "synced" && s.created_at < limit));
  save();
}
