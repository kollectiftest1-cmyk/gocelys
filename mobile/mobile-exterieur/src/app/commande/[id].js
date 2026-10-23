import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, Phone, RotateCcw, Star, Store, Truck } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { Banner, Button, Card, Header, Pill, Screen, T } from "../../components/ui";
import { api } from "../../lib/api";
import { datetime, money, num, time } from "../../lib/format";
import { useShop } from "../../lib/shop";
import { DELIVERY_STEPS, ORDER, PICKUP_STEPS } from "../../lib/status";
import { colors, font } from "../../lib/theme";

const DELIVERY_INDEX = { confirmed: 0, accepted: 1, preparing: 2, ready: 2, driver_assigned: 3, in_delivery: 3, delivered: 4, completed: 4 };
const PICKUP_INDEX = { confirmed: 0, accepted: 1, preparing: 2, ready: 3, completed: 4 };

export default function OrderTracking() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const shop = useShop();
  const [o, setO] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setO(await api.get(`/shop/orders/${id}/`));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  if (!o) return <Screen><Header title="Commande" back />{error ? <Banner tone="clay" text={error} style={{ margin: 16 }} /> : null}</Screen>;

  const pickup = o.fulfillment === "pickup";
  const steps = pickup ? PICKUP_STEPS : DELIVERY_STEPS;
  const idx = (pickup ? PICKUP_INDEX : DELIVERY_INDEX)[o.status] ?? -1;
  const [label, tone] = ORDER[o.status] || [o.status_label, "neutral"];
  const stopped = ["cancelled", "refused", "failed", "refunded"].includes(o.status);
  const otp = o.delivery?.otp_code;

  const cancel = async () => {
    try {
      setO(await api.post(`/shop/orders/${o.id}/cancel/`, { reason: "Annulée par le client" }));
    } catch (e) {
      setError(e.message);
    }
  };
  const rate = async (r) => {
    try {
      setO(await api.post(`/shop/orders/${o.id}/rate/`, { rating: r }));
    } catch (e) {
      setError(e.message);
    }
  };
  const reorder = async () => {
    try {
      const lines = await api.post("/shop/orders/reorder/", { order: o.id });
      const next = [];
      for (const l of lines) {
        const p = shop.catalog.find((x) => x.id === l.product);
        const u = p?.units.find((x) => x.id === l.product_unit) || p?.units[0];
        if (p && u) next.push({ product: p.id, unit: u.id, name: p.name, unitName: u.unit, factor: Number(u.factor), price: Number(u.current_price), accent: p.accent, quantity: Number(l.quantity) });
      }
      shop.replace(next);
      router.push("/panier");
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Screen>
      <Header title={o.reference} subtitle={`${o.agency_name} · ${datetime(o.created_at)}`} back right={<Pill label={label} tone={tone} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {error ? <Banner tone="clay" text={error} /> : null}

        {!pickup && otp && !["completed", "delivered", ...["cancelled", "refused"]].includes(o.status) && (
          <View style={{ backgroundColor: colors.night800, borderRadius: 22, padding: 20, gap: 6 }}>
            <T color={colors.onNightSoft} style={{ fontFamily: font.semibold }}>Code de livraison à donner au livreur</T>
            <T style={{ fontFamily: font.display, fontSize: 48, color: "#fff", letterSpacing: 12 }}>{otp}</T>
            <T variant="xs" color={colors.onNightSoft}>Ne le communiquez qu'une fois les produits reçus.</T>
          </View>
        )}
        {pickup && o.pickup_code && !["completed", "cancelled", "refused"].includes(o.status) && (
          <View style={{ backgroundColor: o.status === "ready" ? colors.leaf500 : colors.night800, borderRadius: 22, padding: 20, gap: 6 }}>
            <T color="#E6FFF1" style={{ fontFamily: font.semibold }}>{o.status === "ready" ? "Votre commande vous attend !" : "Code de retrait"}</T>
            <T style={{ fontFamily: font.display, fontSize: 48, color: "#fff", letterSpacing: 12 }}>{o.pickup_code}</T>
            <T variant="xs" color="#E6FFF1">À présenter au comptoir de {o.agency_name}.</T>
          </View>
        )}

        {stopped ? (
          <Banner tone="clay" text={o.status === "failed" ? "La livraison n'a pas pu aboutir. L'agence va vous rappeler." : `Commande ${label.toLowerCase()}.`} />
        ) : (
          <Card style={{ gap: 0 }}>
            {steps.map(([key, title, text], i) => {
              const done = i <= idx;
              const current = i === idx;
              return (
                <View key={key} style={{ flexDirection: "row", gap: 14 }}>
                  <View style={{ alignItems: "center" }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: done ? (current ? colors.coral500 : colors.sky500) : colors.line, alignItems: "center", justifyContent: "center" }}>
                      {done && !current ? <Check size={15} color="#fff" /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current ? "#FFFFFF" : colors.lineStrong }} />}
                    </View>
                    {i < steps.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 28, backgroundColor: i < idx ? colors.sky500 : colors.line }} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 18 }}>
                    <T style={{ fontFamily: current ? font.bold : font.semibold, color: done ? colors.text : colors.faint }}>{title}</T>
                    {current && <T variant="small">{text}</T>}
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {o.delivery?.driver_name && (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sky100, alignItems: "center", justifyContent: "center" }}>
              <Truck color={colors.sky600} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: font.bold }}>{o.delivery.driver_name}</T>
              <T variant="xs">Votre livreur{o.delivery.departed_at ? ` · parti à ${time(o.delivery.departed_at)}` : ""}</T>
            </View>
            {o.delivery.driver_phone && (
              <Pressable onPress={() => Linking.openURL(`tel:${o.delivery.driver_phone}`)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.leaf500, alignItems: "center", justifyContent: "center" }} accessibilityLabel="Appeler le livreur">
                <Phone color="#fff" size={20} />
              </Pressable>
            )}
          </Card>
        )}

        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {pickup ? <Store size={16} color={colors.faint} /> : <Truck size={16} color={colors.faint} />}
            <T variant="small" style={{ flex: 1 }}>{pickup ? `Retrait à ${o.agency_name}` : o.address_text}</T>
          </View>
          {o.lines.map((l) => (
            <View key={l.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T style={{ flex: 1 }}>{num(l.quantity)} × {l.label}</T>
              <T>{money(l.total)}</T>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
          {Number(o.discount) > 0 && <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T color={colors.leaf600}>Remise</T><T color={colors.leaf600}>−{money(o.discount)}</T></View>}
          {!pickup && <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T color={colors.soft}>Livraison</T><T>{money(o.delivery_fee)}</T></View>}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <T style={{ fontFamily: font.bold }}>Total</T>
            <T style={{ fontFamily: font.display, fontSize: 22 }}>{money(o.total)}</T>
          </View>
          <T variant="xs">{o.payment_status === "paid" ? `Payée · ${o.payment_method_name}` : o.payment_status === "pending" ? `Paiement ${o.payment_method_name} en cours de vérification` : "À payer en espèces"}</T>
        </Card>

        {o.status === "completed" && (
          <Card style={{ gap: 10, alignItems: "center" }}>
            <T style={{ fontFamily: font.semibold }}>{o.rating ? "Merci pour votre avis !" : "Comment s'est passée votre commande ?"}</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((r) => (
                <Pressable key={r} onPress={() => rate(r)} hitSlop={6} accessibilityLabel={`${r} étoile(s)`}>
                  <Star size={32} color={colors.coral500} fill={(o.rating || 0) >= r ? colors.coral500 : "transparent"} />
                </Pressable>
              ))}
            </View>
          </Card>
        )}
        {["completed", "cancelled", "refused"].includes(o.status) && <Button title="Commander à nouveau" icon={RotateCcw} variant="outline" onPress={reorder} />}
        {["confirmed", "accepted"].includes(o.status) && <Button title="Annuler la commande" variant="danger" onPress={cancel} />}
      </ScrollView>
    </Screen>
  );
}
