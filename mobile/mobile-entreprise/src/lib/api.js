import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { kvGet, kvSet } from "./db";

const TOKENS = "gocelsys.tokens";

export function getServer() {
  return (kvGet("server") || Constants.expoConfig?.extra?.apiUrl || "http://192.168.1.10:8000").replace(/\/$/, "");
}
export function setServer(url) {
  kvSet("server", url.trim().replace(/\/$/, ""));
}

async function readTokens() {
  try {
    const raw = Platform.OS === "web" ? JSON.stringify(kvGet(TOKENS)) : await SecureStore.getItemAsync(TOKENS);
    return raw && raw !== "null" ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens) {
  if (Platform.OS === "web") return kvSet(TOKENS, tokens);
  if (tokens) await SecureStore.setItemAsync(TOKENS, JSON.stringify(tokens));
  else await SecureStore.deleteItemAsync(TOKENS);
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.offline = status === 0;
  }
}

function messageFrom(data, status) {
  if (!data) return `Erreur ${status}`;
  if (typeof data === "string") return data.slice(0, 200);
  if (data.detail) return data.detail;
  const [key, value] = Object.entries(data)[0] || [];
  const text = Array.isArray(value) ? value[0] : typeof value === "string" ? value : JSON.stringify(value);
  return key && key !== "non_field_errors" ? `${key} : ${text}` : text;
}

let refreshing = null;
async function refresh() {
  const t = await readTokens();
  if (!t?.refresh) return null;
  refreshing =
    refreshing ||
    fetch(`${getServer()}/api/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: t.refresh }),
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const d = await r.json();
        const next = { ...t, access: d.access, refresh: d.refresh || t.refresh };
        await saveTokens(next);
        return next;
      })
      .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

/** Requête API. Lève ApiError (status 0 = hors connexion). */
export async function request(path, { method = "GET", body, params, form, timeout = 20000, auth = true } = {}) {
  const qs = params
    ? "?" + Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    : "";
  const url = `${getServer()}/api${path}${qs}`;
  const send = async (token) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      return await fetch(url, {
        method,
        signal: ctrl.signal,
        headers: {
          Accept: "application/json",
          ...(form ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      });
    } finally {
      clearTimeout(timer);
    }
  };
  let tokens = auth ? await readTokens() : null;
  let res;
  try {
    res = await send(tokens?.access);
    if (res.status === 401 && auth && tokens?.refresh) {
      tokens = await refresh();
      if (tokens) res = await send(tokens.access);
    }
  } catch {
    throw new ApiError("Pas de connexion au serveur Gocelsys.", 0);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(messageFrom(data, res.status), res.status, data);
  return data;
}

export const api = {
  get: (p, params) => request(p, { params }),
  post: (p, body) => request(p, { method: "POST", body }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  upload: (p, form) => request(p, { method: "POST", form, timeout: 60000 }),
};

export { readTokens };
