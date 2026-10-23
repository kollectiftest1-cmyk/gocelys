import Constants from "expo-constants";

import { getJSON, getSecret, setJSON, setSecret } from "./storage";

const TOKENS = "gocelsys.client.tokens";
let server = Constants.expoConfig?.extra?.apiUrl || "http://192.168.1.10:8000";

export async function loadServer() {
  server = (await getJSON("gocelsys.client.server")) || server;
  return server;
}
export const getServer = () => server;
export async function setServer(url) {
  server = url.trim().replace(/\/$/, "");
  await setJSON("gocelsys.client.server", server);
}

export const saveTokens = (t) => setSecret(TOKENS, t);
export const readTokens = () => getSecret(TOKENS);

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
  const labels = { phone: "Téléphone", password: "Mot de passe", name: "Nom" };
  return key && key !== "non_field_errors" ? `${labels[key] || key} : ${text}` : text;
}

async function refresh(t) {
  const r = await fetch(`${server}/api/auth/refresh/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: t.refresh }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const next = { access: d.access, refresh: d.refresh || t.refresh };
  await saveTokens(next);
  return next;
}

export async function request(path, { method = "GET", body, params } = {}) {
  const qs = params ? "?" + Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
  const send = (token) =>
    fetch(`${server}/api${path}${qs}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  let tokens = await readTokens();
  let res;
  try {
    res = await send(tokens?.access);
    if (res.status === 401 && tokens?.refresh) {
      tokens = await refresh(tokens);
      if (tokens) res = await send(tokens.access);
    }
  } catch {
    throw new ApiError("Connexion impossible. Vérifiez votre réseau.", 0);
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
  del: (p) => request(p, { method: "DELETE" }),
};
