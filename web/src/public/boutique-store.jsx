/** Boutique web : agence choisie, référentiel public et panier (gardé dans le navigateur). */
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { get, patch } from "../api/client";
import { useAuth } from "../lib/auth";

const ShopContext = createContext(null);
const CART = "gocelsys.cart";
const AGENCY = "gocelsys.shop.agency";

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

export function ShopProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(() => read(CART, []));
  const [agencyId, setAgencyId] = useState(() => read(AGENCY, null));
  const { data: boot } = useQuery({ queryKey: ["shop-boot"], queryFn: () => get("/shop/bootstrap/"), staleTime: 300000 });

  useEffect(() => {
    if (!boot) return;
    const valid = boot.agencies.some((a) => a.id === agencyId);
    if (!valid) {
      const pref = user?.customer?.preferred_agency;
      const next = boot.agencies.find((a) => a.id === pref)?.id || boot.agencies[0]?.id || null;
      setAgencyId(next);
      write(AGENCY, next);
    }
  }, [boot, agencyId, user]);

  const save = useCallback((next) => {
    setCart(next);
    write(CART, next);
  }, []);

  const value = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + Number(l.price) * l.quantity, 0);
    return {
      boot,
      agencies: boot?.agencies || [],
      agency: (boot?.agencies || []).find((a) => a.id === agencyId) || null,
      agencyId,
      setAgency(id) {
        setAgencyId(id);
        write(AGENCY, id);
        if (user?.kind === "customer") patch("/shop/profile/", { preferred_agency: id }).catch(() => {});
      },
      categories: boot?.categories || [],
      zones: (boot?.zones || []).filter((z) => z.agency === agencyId),
      methods: boot?.payment_methods || [],
      cart,
      count: cart.reduce((s, l) => s + l.quantity, 0),
      subtotal,
      add(product, unit, quantity = 1) {
        const i = cart.findIndex((l) => l.unit === unit.id);
        if (i >= 0) save(cart.map((l, j) => (j === i ? { ...l, quantity: l.quantity + quantity } : l)));
        else save([...cart, {
          product: product.id, unit: unit.id, name: product.name, unitName: unit.unit, factor: Number(unit.factor),
          price: Number(unit.current_price), accent: product.accent, visual: product.visual, image: product.image, image_cutout: product.image_cutout, quantity,
        }]);
      },
      setQty(unitId, q) {
        save(q <= 0 ? cart.filter((l) => l.unit !== unitId) : cart.map((l) => (l.unit === unitId ? { ...l, quantity: q } : l)));
      },
      replace: save,
      clear: () => save([]),
    };
  }, [boot, agencyId, cart, save, user]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = () => useContext(ShopContext);

/** Catalogue public de l'agence choisie. */
export function useCatalog(params = {}) {
  const { agencyId } = useShop();
  return useQuery({
    queryKey: ["shop-catalog", agencyId, params],
    queryFn: () => get("/shop/catalog/", { agency: agencyId, ...params }),
    enabled: Boolean(agencyId),
    staleTime: 60000,
  });
}
