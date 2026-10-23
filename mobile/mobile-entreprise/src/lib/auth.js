import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, readTokens, saveTokens } from "./api";
import { kvGet, kvSet } from "./db";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => kvGet("me"));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await readTokens();
      if (!t) {
        setUser(null);
        setReady(true);
        return;
      }
      try {
        const me = await api.get("/auth/me/");
        kvSet("me", me);
        setUser(me);
      } catch (e) {
        if (e.status === 401) {
          await saveTokens(null);
          setUser(null);
        }
        // Hors connexion : on garde le profil en cache pour continuer à vendre.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    const data = await api.post("/auth/login/", { identifier, password });
    if (data.user.kind === "customer") throw new Error("Ce compte est un compte client. Utilisez l'application Gocelsys.");
    await saveTokens({ access: data.access, refresh: data.refresh });
    kvSet("me", data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const t = await readTokens();
    api.post("/auth/logout/", { refresh: t?.refresh }).catch(() => {});
    await saveTokens(null);
    kvSet("me", null);
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const perms = new Set(user?.permissions || []);
    return { user, ready, login, logout, can: (...codes) => codes.some((c) => perms.has(c)) };
  }, [user, ready, login, logout]);

  return createElement(AuthContext.Provider, { value }, children);
}

export const useAuth = () => useContext(AuthContext);
