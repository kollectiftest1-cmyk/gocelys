import { useQuery } from "@tanstack/react-query";

import { get } from "../api/client";

/** Données de référence partagées (agences, produits, moyens de paiement…), mises en cache 5 min. */
const ref = (key, url, params) => ({ queryKey: ["ref", key, params], queryFn: () => get(url, params), staleTime: 300000 });

const rows = (d) => (Array.isArray(d) ? d : d?.results || []);

export const useAgencies = () => {
  const q = useQuery(ref("agencies", "/agencies/", { page_size: 100 }));
  return rows(q.data);
};
export const useCategories = () => rows(useQuery(ref("categories", "/categories/")).data);
export const useUnits = () => rows(useQuery(ref("units", "/units/")).data);
export const usePaymentMethods = () => rows(useQuery(ref("methods", "/payment-methods/")).data);
export const useFinanceCategories = () => rows(useQuery(ref("fincat", "/finance/categories/")).data);
export const useProducts = () => rows(useQuery(ref("products", "/products/", { page_size: 500 })).data);
export const useRoles = () => rows(useQuery(ref("roles", "/auth/roles/")).data);
export const useDrivers = (agency, enabled = true) =>
  rows(useQuery({ ...ref("drivers", "/drivers/", agency ? { agency } : {}), enabled }).data);
