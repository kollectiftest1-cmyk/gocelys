import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";

/** Agence active (filtre global de l'interface). "" = toutes les agences autorisées. */
const WorkspaceContext = createContext(null);
const KEY = "gocelsys.agency";

export function WorkspaceProvider({ children }) {
  const { agencies, isGlobal } = useAuth();
  const [agency, setAgencyState] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (!agencies.length) return;
    const known = agencies.some((a) => String(a.id) === String(agency));
    if (agency && !known) setAgencyState("");
    if (!agency && !isGlobal && agencies.length === 1) setAgencyState(String(agencies[0].id));
  }, [agencies, agency, isGlobal]);

  const value = useMemo(
    () => ({
      agency,
      agencyObj: agencies.find((a) => String(a.id) === String(agency)) || null,
      setAgency: (id) => {
        setAgencyState(id ? String(id) : "");
        try {
          localStorage.setItem(KEY, id ? String(id) : "");
        } catch {
          /* ignore */
        }
      },
      params: agency ? { agency } : {},
    }),
    [agency, agencies]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
