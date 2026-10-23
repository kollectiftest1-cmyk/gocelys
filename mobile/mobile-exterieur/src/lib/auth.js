import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, loadServer, readTokens, saveTokens } from "./api";
import { getJSON, setJSON } from "./storage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refreshMe = useCallback(async () => {
    const me = await api.get("/auth/me/");
    setUser(me);
    setJSON("gocelsys.client.me", me);
    return me;
  }, []);

  useEffect(() => {
    (async () => {
      await loadServer();
      const cached = await getJSON("gocelsys.client.me");
      const t = await readTokens();
      if (!t) {
        setReady(true);
        return;
      }
      setUser(cached);
      try {
        await refreshMe();
      } catch (e) {
        if (e.status === 401) {
          await saveTokens(null);
          setUser(null);
        }
      } finally {
        setReady(true);
      }
    })();
  }, [refreshMe]);

  const finish = async (data) => {
    if (data.user.kind !== "customer") throw new Error("Ce compte appartient au personnel Gocelsys. Utilisez l'application Gocelsys Entreprise.");
    await saveTokens({ access: data.access, refresh: data.refresh });
    setJSON("gocelsys.client.me", data.user);
    setUser(data.user);
  };

  const login = useCallback(async (identifier, password) => finish(await api.post("/auth/login/", { identifier, password })), []);
  const register = useCallback(async (form) => finish(await api.post("/auth/register/", form)), []);
  const logout = useCallback(async () => {
    const t = await readTokens();
    api.post("/auth/logout/", { refresh: t?.refresh }).catch(() => {});
    await saveTokens(null);
    setJSON("gocelsys.client.me", null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, register, logout, refreshMe }), [user, ready, login, register, logout, refreshMe]);
  return createElement(AuthContext.Provider, { value }, children);
}

export const useAuth = () => useContext(AuthContext);
