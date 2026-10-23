/**
 * Base locale SQLite — le cœur du fonctionnement hors connexion.
 *  - kv      : données de référence (catalogue, moyens de paiement, session de caisse…)
 *  - outbox  : opérations à envoyer au serveur, dans l'ordre, chacune avec un op_id unique
 *  - sales   : ventes saisies sur cet appareil (affichage immédiat, suivi de synchronisation)
 */
import * as SQLite from "expo-sqlite";

let db;

export function getDb() {
  if (!db) {
    db = SQLite.openDatabaseSync("gocelsys-entreprise.db");
    db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (
        op_id TEXT PRIMARY KEY NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        result TEXT
      );
      CREATE TABLE IF NOT EXISTS sales (
        client_uuid TEXT PRIMARY KEY NOT NULL,
        local_ref TEXT NOT NULL,
        session_uuid TEXT,
        total REAL NOT NULL,
        cash REAL NOT NULL DEFAULT 0,
        payload TEXT NOT NULL,
        server_ref TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

export function kvGet(key, fallback = null) {
  const row = getDb().getFirstSync("SELECT value FROM kv WHERE key = ?", [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

export function kvSet(key, value) {
  if (value === null || value === undefined) {
    getDb().runSync("DELETE FROM kv WHERE key = ?", [key]);
    return;
  }
  getDb().runSync("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)", [key, JSON.stringify(value), Date.now()]);
}

export function enqueue(op_id, type, payload, occurred_at = new Date().toISOString()) {
  const d = getDb();
  const next = (d.getFirstSync("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM outbox")?.n) || 1;
  d.runSync("INSERT INTO outbox (op_id, seq, type, payload, occurred_at) VALUES (?, ?, ?, ?, ?)", [op_id, next, type, JSON.stringify(payload), occurred_at]);
}

export function pendingOps(limit = 100) {
  return getDb()
    .getAllSync("SELECT * FROM outbox WHERE status = 'pending' ORDER BY seq LIMIT ?", [limit])
    .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

export function outboxCounts() {
  const rows = getDb().getAllSync("SELECT status, COUNT(*) AS n FROM outbox GROUP BY status");
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function rejectedOps() {
  return getDb().getAllSync("SELECT * FROM outbox WHERE status = 'rejected' ORDER BY seq DESC LIMIT 50");
}

export function markOp(op_id, status, { error = null, result = null } = {}) {
  getDb().runSync("UPDATE outbox SET status = ?, error = ?, result = ?, attempts = attempts + 1 WHERE op_id = ?", [
    status, error, result ? JSON.stringify(result) : null, op_id,
  ]);
}

export function bumpAttempt(op_id, error) {
  getDb().runSync("UPDATE outbox SET attempts = attempts + 1, error = ? WHERE op_id = ?", [error, op_id]);
}

export function saveLocalSale(sale) {
  getDb().runSync(
    "INSERT OR REPLACE INTO sales (client_uuid, local_ref, session_uuid, total, cash, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    [sale.client_uuid, sale.local_ref, sale.session_uuid, sale.total, sale.cash, JSON.stringify(sale), sale.created_at]
  );
}

export function markSale(client_uuid, status, server_ref = null) {
  getDb().runSync("UPDATE sales SET status = ?, server_ref = COALESCE(?, server_ref) WHERE client_uuid = ?", [status, server_ref, client_uuid]);
}

export function sessionSales(session_uuid) {
  return getDb()
    .getAllSync("SELECT * FROM sales WHERE session_uuid = ? ORDER BY created_at DESC", [session_uuid])
    .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

export function purgeDone(days = 14) {
  const limit = new Date(Date.now() - days * 86400000).toISOString();
  getDb().runSync("DELETE FROM outbox WHERE status IN ('applied', 'duplicate') AND occurred_at < ?", [limit]);
  getDb().runSync("DELETE FROM sales WHERE status = 'synced' AND created_at < ?", [limit]);
}
