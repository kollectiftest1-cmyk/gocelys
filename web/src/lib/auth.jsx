import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { get, loadSession, post, saveSession, setOnExpired } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  const [user, setUser] = useState(session?.user || null);
  const [loading, setLoading] = useState(Boolean(session));

  const logout = useCallback(async () => {
    const s = loadSession();
    if (s?.refresh) post("/auth/logout/", { refresh: s.refresh }).catch(() => {});
    saveSession(null);
    setSession(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnExpired(() => {
      setSession(null);
      setUser(null);
    });
    if (!session) return;
    get("/auth/me/")
      .then((me) => {
        setUser(me);
        saveSession({ ...loadSession(), user: me });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (identifier, password) => {
    const data = await post("/auth/login/", { identifier, password });
    saveSession(data);
    setSession(data);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (form) => {
    const data = await post("/auth/register/", form);
    saveSession(data);
    setSession(data);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(() => {
    const perms = new Set(user?.permissions || []);
    return {
      user,
      loading,
      isAuthenticated: Boolean(session && user),
      login,
      register,
      logout,
      isStaff: user?.kind === "staff",
      can: (...codes) => codes.some((c) => perms.has(c)),
      agencies: user?.agencies || [],
      isGlobal: Boolean(user?.is_global),
    };
  }, [user, session, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
