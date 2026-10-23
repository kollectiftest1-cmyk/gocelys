import { createContext, createElement, useContext, useMemo, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]);
  const value = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + Number(l.unit.current_price) * l.quantity, 0);
    const items = lines.reduce((s, l) => s + l.quantity, 0);
    return {
      lines,
      subtotal,
      items,
      add(product, unit) {
        unit = unit || product.units.find((u) => u.is_default) || product.units[0];
        setLines((c) => {
          const i = c.findIndex((l) => l.unit.id === unit.id);
          if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
          return [...c, { product, unit, quantity: 1 }];
        });
      },
      setQty(unitId, quantity) {
        setLines((c) => (quantity <= 0 ? c.filter((l) => l.unit.id !== unitId) : c.map((l) => (l.unit.id === unitId ? { ...l, quantity } : l))));
      },
      clear: () => setLines([]),
    };
  }, [lines]);
  return createElement(CartContext.Provider, { value }, children);
}

export const useCart = () => useContext(CartContext);
