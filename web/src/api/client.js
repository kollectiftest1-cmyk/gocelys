import axios from "axios";

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api";
const STORE = "gocelsys.session";

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORE, JSON.stringify(session));
    else localStorage.removeItem(STORE);
  } catch {
    /* stockage indisponible : la session reste en mémoire */
  }
}

export const api = axios.create({ baseURL: BASE, timeout: 30000 });

let onExpired = () => {};
export function setOnExpired(fn) {
  onExpired = fn;
}

api.interceptors.request.use((config) => {
  const s = loadSession();
  if (s?.access) config.headers.Authorization = `Bearer ${s.access}`;
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const s = loadSession();
    if (error.response?.status === 401 && s?.refresh && !original._retry && !original.url.includes("/auth/")) {
      original._retry = true;
      try {
        refreshing =
          refreshing ||
          axios.post(`${BASE}/auth/refresh/`, { refresh: s.refresh }).finally(() => {
            setTimeout(() => (refreshing = null), 0);
          });
        const { data } = await refreshing;
        saveSession({ ...s, access: data.access, refresh: data.refresh || s.refresh });
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        saveSession(null);
        onExpired();
      }
    }
    return Promise.reject(error);
  }
);

/** Message lisible à partir d'une erreur API. */
export function errorMessage(error) {
  const data = error?.response?.data;
  if (!error?.response) return "Serveur injoignable. Vérifiez la connexion puis réessayez.";
  if (typeof data === "string") return data.slice(0, 200);
  if (data?.detail) return data.detail;
  if (data && typeof data === "object") {
    const [key, value] = Object.entries(data)[0] || [];
    const text = Array.isArray(value) ? value[0] : typeof value === "string" ? value : JSON.stringify(value);
    return key && key !== "non_field_errors" ? `${key} : ${text}` : text;
  }
  return "Une erreur est survenue.";
}

export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
export const post = (url, body, config) => api.post(url, body, config).then((r) => r.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data);
export const del = (url) => api.delete(url).then((r) => r.data);

export async function download(url, params, filename) {
  const r = await api.get(url, { params, responseType: "blob" });
  const href = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
