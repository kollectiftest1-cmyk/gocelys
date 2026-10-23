import { kvGet, kvSet } from "./db";

/** Agence de travail de l'utilisateur sur cet appareil. */
export function workAgency(user) {
  const saved = kvGet("work_agency");
  const list = user?.agencies || [];
  if (saved && list.some((a) => a.id === saved)) return list.find((a) => a.id === saved);
  return list.find((a) => a.id === user?.default_agency) || list[0] || null;
}

export function setWorkAgency(id) {
  kvSet("work_agency", id);
}
