import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { get } from "../api/client";

/** Liste paginée côté serveur (DRF) avec filtres. */
export function useList(url, filters = {}, options = {}) {
  const [page, setPage] = useState(1);
  const key = JSON.stringify(filters);
  useEffect(() => setPage(1), [key]);
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined && v !== null));
  const query = useQuery({
    queryKey: [url, clean, page],
    queryFn: () => get(url, { ...clean, page, page_size: options.pageSize || 25 }),
    placeholderData: keepPreviousData,
    ...options,
  });
  const data = query.data;
  return {
    ...query,
    rows: Array.isArray(data) ? data : data?.results || [],
    count: Array.isArray(data) ? data.length : data?.count || 0,
    page,
    setPage,
    pageSize: options.pageSize || 25,
  };
}

/** Débounce d'une valeur (recherche). */
export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
