/**
 * Moteur de synchronisation (cahier des charges §32).
 * Toutes les opérations de caisse passent par la file locale `outbox`, en ligne comme hors ligne :
 * un seul chemin, testé en permanence. Le serveur applique chaque op_id une seule fois
 * (doublons ignorés), dans l'ordre, et renvoie les références définitives.
 */
import NetInfo from "@react-native-community/netinfo";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api";
import { bumpAttempt, kvGet, kvSet, markOp, markSale, outboxCounts, pendingOps, purgeDone } from "./db";
import { uuid } from "./uuid";

const SyncContext = createContext(null);

export function deviceId() {
  let id = kvGet("device_id");
  if (!id) {
    id = `app-${uuid().slice(0, 8)}`;
    kvSet("device_id", id);
  }
  return id;
}

export async function pullReference(agencyId) {
  const data = await api.get("/sync/pull/", { agency: agencyId });
  kvSet("catalog", { ...data, agency: agencyId, pulled_at: new Date().toISOString() });
  return data;
}

async function pushOutbox() {
  let applied = 0;
  for (let round = 0; round < 10; round++) {
    const ops = pendingOps(100);
    if (!ops.length) break;
    const session = kvGet("pos.session");
    let res;
    try {
      res = await api.post("/sync/push/", {
        device_id: deviceId(),
        pos: session?.pos,
        operations: ops.map((o) => ({ op_id: o.op_id, type: o.type, occurred_at: o.occurred_at, payload: o.payload })),
      });
    } catch (e) {
      ops.forEach((o) => bumpAttempt(o.op_id, e.message));
      throw e;
    }
    for (const r of res.results) {
      const op = ops.find((o) => o.op_id === r.op_id);
      if (r.status === "rejected") {
        markOp(r.op_id, "rejected", { error: r.error });
        if (op?.type === "sale.create") markSale(op.payload.client_uuid, "rejected");
      } else {
        markOp(r.op_id, r.status, { result: r.result });
        applied++;
        if (op?.type === "sale.create") markSale(op.payload.client_uuid, "synced", r.result?.reference);
        if (op?.type === "session.open" && r.result?.session) {
          const s = kvGet("pos.session");
          if (s && s.session_uuid === op.payload.session_uuid) kvSet("pos.session", { ...s, server_id: r.result.session, reference: r.result.reference });
        }
      }
    }
    if (ops.length < 100) break;
  }
  return applied;
}

export function SyncProvider({ children }) {
  const [online, setOnline] = useState(true);
  const [counts, setCounts] = useState(() => outboxCounts());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(() => kvGet("last_sync"));
  const [lastError, setLastError] = useState(null);
  const running = useRef(false);

  const refreshCounts = useCallback(() => setCounts(outboxCounts()), []);

  const syncNow = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      await pushOutbox();
      const now = new Date().toISOString();
      kvSet("last_sync", now);
      setLastSync(now);
      setLastError(null);
      setOnline(true);
      purgeDone();
    } catch (e) {
      setLastError(e.message);
      if (e.offline) setOnline(false);
    } finally {
      running.current = false;
      setSyncing(false);
      refreshCounts();
    }
  }, [refreshCounts]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const ok = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(ok);
      if (ok) syncNow();
    });
    const timer = setInterval(syncNow, 20000);
    syncNow();
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [syncNow]);

  const value = useMemo(
    () => ({ online, pending: counts.pending || 0, rejected: counts.rejected || 0, syncing, lastSync, lastError, syncNow, refreshCounts }),
    [online, counts, syncing, lastSync, lastError, syncNow, refreshCounts]
  );
  return createElement(SyncContext.Provider, { value }, children);
}

export const useSync = () => useContext(SyncContext);
