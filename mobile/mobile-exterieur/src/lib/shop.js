/** Boutique : agence choisie, référentiel (agences, zones, paiements), panier persistant. */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "./api";
import { useAuth } from "./auth";
import { getJSON, setJSON } from "./storage";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const { user } = useAuth();
  const [boot, setBoot] = useState(null);
  const [agencyId, setAgencyId] = useState(null);
  const [cart, setCart] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setCart((await getJSON("gocelsys.client.cart")) || []);
      setAgencyId(await getJSON("gocelsys.client.agency"));
      setBoot(await getJSON("gocelsys.client.boot"));
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get("/shop/bootstrap/").then((b) => {
      setBoot(b);
      setJSON("gocelsys.client.boot", b);
      setAgencyId((current) => {
        const valid = current && b.agencies.some((a) => a.id === current);
        if (valid) return current;
        const pref = user.customer?.preferred_agency;
        const next = b.agencies.find((a) => a.id === pref)?.id || b.agencies[0]?.id || null;
        setJSON("gocelsys.client.agency", next);
        return next;
      });
    }).catch(() => {});
  }, [user]);

  const loadCatalog = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    try {
      const items = await api.get("/shop/catalog/", { agency: agencyId });
      setCatalog(items);
      setJSON(`gocelsys.client.catalog.${agencyId}`, items);
      setError("");
    } catch (e) {
      setCatalog((await getJSON(`gocelsys.client.catalog.${agencyId}`)) || []);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => {
    if (user && agencyId) loadCatalog();
  }, [user, agencyId, loadCatalog]);

  const value = useMemo(() => {
    const save = (next) => {
      setCart(next);
      setJSON("gocelsys.client.cart", next);
    };
    const subtotal = cart.reduce((s, l) => s + Number(l.price) * l.quantity, 0);
    return {
      boot,
      agencies: boot?.agencies || [],
      agency: (boot?.agencies || []).find((a) => a.id === agencyId) || null,
      setAgency: (id) => {
        setAgencyId(id);
        setJSON("gocelsys.client.agency", id);
        api.patch("/shop/profile/", { preferred_agency: id }).catch(() => {});
      },
      zones: (boot?.zones || []).filter((z) => z.agency === agencyId),
      methods: boot?.payment_methods || [],
      catalog,
      loading,
      error,
      reload: loadCatalog,
      cart,
      count: cart.reduce((s, l) => s + l.quantity, 0),
      subtotal,
      add(product, unit, quantity = 1) {
        const i = cart.findIndex((l) => l.unit === unit.id);
        if (i >= 0) save(cart.map((l, j) => (j === i ? { ...l, quantity: l.quantity + quantity } : l)));
        else save([...cart, { product: product.id, unit: unit.id, name: product.name, unitName: unit.unit, factor: Number(unit.factor), price: Number(unit.current_price), accent: product.accent, quantity }]);
      },
      setQty(unitId, q) {
        save(q <= 0 ? cart.filter((l) => l.unit !== unitId) : cart.map((l) => (l.unit === unitId ? { ...l, quantity: q } : l)));
      },
      replace: save,
      clear: () => save([]),
    };
  }, [boot, agencyId, catalog, loading, error, loadCatalog, cart]);

  return createElement(ShopContext.Provider, { value }, children);
}

export const useShop = () => useContext(ShopContext);
