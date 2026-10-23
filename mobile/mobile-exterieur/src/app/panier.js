import * as Crypto from "expo-crypto";
import { useFocusEffect, useRouter } from "expo-router";
import { Banknote, Check, MapPin, Minus, Plus, Smartphone, Store, Truck, X } from "lucide-react-native";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, Button, Empty, T } from "../components/ui";
import { api } from "../lib/api";
import { money, num } from "../lib/format";
import { useShop } from "../lib/shop";
import { colors, font, radius } from "../lib/theme";

function Section({ title, children, right }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T variant="h3">{title}</T>
        {right}
      </View>
      {children}
    </View>
  );
}

function Choice({ active, onPress, icon: Icon, title, text, right }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: active ? colors.brand600 : colors.lineStrong, backgroundColor: active ? colors.brand50 : "#fff" }}>
      {Icon && <Icon size={20} color={active ? colors.brand600 : colors.faint} />}
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.bold, color: active ? colors.brand700 : colors.text }}>{title}</T>
        {text ? <T variant="xs">{text}</T> : null}
      </View>
      {right}
      {active && <Check size={18} color={colors.brand600} />}
    </Pressable>
  );
}

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shop = useShop();
  const [mode, setMode] = useState("delivery");
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState(null);
  const [method, setMethod] = useState(null);
  const [reference, setReference] = useState("");
  const [promo, setPromo] = useState("");
  const [promoState, setPromoState] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    api.get("/shop/addresses/").then((list) => {
      setAddresses(list);
      setAddress((cur) => (cur && list.some((a) => a.id === cur) ? cur : list.find((a) => a.is_default)?.id || list[0]?.id || null));
    }).catch(() => {});
  }, []));

  const addr = addresses.find((a) => a.id === address);
  const zone = shop.zones.find((z) => z.id === addr?.zone) || shop.zones.find((z) => z.name === addr?.zone_name);
  const fee = mode === "delivery" ? Number(zone?.fee || 0) : 0;
  const discount = promoState?.valid ? Number(promoState.discount) : 0;
  const total = shop.subtotal - discount + fee;
  const mm = method && method.kind !== "cash";

  const checkPromo = async () => {
    if (!promo.trim()) return;
    try {
      setPromoState(await api.post("/shop/promo/", { code: promo.trim(), amount: shop.subtotal }));
    } catch (e) {
      setPromoState({ valid: false, detail: e.message });
    }
  };

  const order = async () => {
    setError("");
    if (mode === "delivery" && !address) return setError("Ajoutez une adresse de livraison.");
    if (mm && !reference.trim()) return setError(`Saisissez la référence de votre paiement ${method.name}, ou choisissez de payer à la ${mode === "delivery" ? "livraison" : "remise"}.`);
    setBusy(true);
    try {
      const o = await api.post("/shop/orders/", {
        client_uuid: Crypto.randomUUID(),
        lines: shop.cart.map((l) => ({ product_unit: l.unit, quantity: l.quantity })),
        fulfillment: mode,
        agency: shop.agency?.id,
        address: mode === "delivery" ? address : null,
        payment_method: method?.id || null,
        payment_reference: reference.trim(),
        promo_code: promoState?.valid ? promo.trim() : null,
        note,
      });
      shop.clear();
      router.replace(`/commande/${o.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!shop.cart.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Empty title="Votre panier est vide" text="Ajoutez de l'eau, des boissons ou vos produits du quotidien." action={<Button title="Voir les produits" onPress={() => router.back()} />} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, paddingTop: insets.top + 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View>
          <T variant="h1">Mon panier</T>
          <T variant="xs">{shop.agency?.name}</T>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Fermer"><X size={24} color={colors.text} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 }}>
          {shop.cart.map((l, i) => (
            <View key={l.unit} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ width: 6, alignSelf: "stretch", borderRadius: 3, backgroundColor: l.accent || colors.sky500 }} />
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{l.name}</T>
                <T variant="xs">{l.unitName}{l.factor > 1 ? ` de ${num(l.factor)}` : ""} · {money(l.price)}</T>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 10 }}>
                <Pressable onPress={() => shop.setQty(l.unit, l.quantity - 1)} style={{ padding: 8 }} accessibilityLabel="Moins"><Minus size={15} color={colors.text} /></Pressable>
                <T style={{ fontFamily: font.bold, minWidth: 22, textAlign: "center" }}>{l.quantity}</T>
                <Pressable onPress={() => shop.setQty(l.unit, l.quantity + 1)} style={{ padding: 8 }} accessibilityLabel="Plus"><Plus size={15} color={colors.text} /></Pressable>
              </View>
            </View>
          ))}
        </View>

        <Section title="Comment recevoir votre commande ?">
          <Choice active={mode === "delivery"} onPress={() => setMode("delivery")} icon={Truck} title="Livraison à domicile" text={zone ? `${zone.name} · environ ${zone.estimated_minutes} min · ${money(zone.fee)}` : "Frais selon votre quartier"} />
          <Choice active={mode === "pickup"} onPress={() => setMode("pickup")} icon={Store} title="Retrait en agence" text={`Gratuit · ${shop.agency?.name || ""}`} />
        </Section>

        {mode === "delivery" && (
          <Section title="Adresse" right={<Pressable onPress={() => router.push("/adresse")}><T style={{ color: colors.brand600, fontFamily: font.bold }}>+ Ajouter</T></Pressable>}>
            {addresses.length === 0 && <Banner tone="amber" text="Ajoutez votre adresse pour être livré." />}
            {addresses.map((a) => (
              <Choice key={a.id} active={address === a.id} onPress={() => setAddress(a.id)} icon={MapPin} title={a.label} text={`${a.line}${a.landmark ? ` — ${a.landmark}` : ""}`} />
            ))}
          </Section>
        )}

        <Section title="Paiement">
          <Choice active={!method} onPress={() => setMethod(null)} icon={Banknote} title={`Espèces à la ${mode === "delivery" ? "livraison" : "remise"}`} text="Préparez si possible le montant exact" />
          {shop.methods.filter((m) => m.kind !== "cash").map((m) => (
            <Choice key={m.id} active={method?.id === m.id} onPress={() => setMethod(m)} icon={Smartphone} title={m.name} text="Payez maintenant et saisissez la référence reçue par SMS" />
          ))}
          {mm && (
            <TextInput value={reference} onChangeText={setReference} autoCapitalize="characters" placeholder={`Référence ${method.name}`} placeholderTextColor={colors.faint}
              style={{ height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 16 }} />
          )}
        </Section>

        <Section title="Code promo">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput value={promo} onChangeText={(t) => { setPromo(t); setPromoState(null); }} autoCapitalize="characters" placeholder="BIENVENUE" placeholderTextColor={colors.faint}
              style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 16 }} />
            <Button title="Appliquer" variant="outline" onPress={checkPromo} />
          </View>
          {promoState && <T style={{ color: promoState.valid ? colors.leaf600 : colors.clay600, fontFamily: font.semibold }}>{promoState.valid ? `${promoState.label} : −${money(promoState.discount)}` : promoState.detail}</T>}
        </Section>

        <TextInput value={note} onChangeText={setNote} placeholder="Une précision pour l'agence ou le livreur ?" placeholderTextColor={colors.faint} multiline
          style={{ minHeight: 70, borderRadius: 14, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", padding: 14, fontFamily: font.body, fontSize: 15, textAlignVertical: "top" }} />

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T color={colors.soft}>Produits</T><T>{money(shop.subtotal)}</T></View>
          {discount > 0 && <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T color={colors.leaf600}>Remise</T><T color={colors.leaf600}>−{money(discount)}</T></View>}
          {mode === "delivery" && <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T color={colors.soft}>Livraison</T><T>{zone ? money(fee) : "selon le quartier"}</T></View>}
        </View>
        {error ? <Banner tone="clay" text={error} /> : null}
      </ScrollView>
      <View style={{ padding: 18, paddingBottom: insets.bottom + 14, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.line, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <T style={{ fontFamily: font.semibold }}>Total</T>
          <T style={{ fontFamily: font.display, fontSize: 28 }}>{money(total)}</T>
        </View>
        <Button title="Commander" size="lg" loading={busy} onPress={order} />
      </View>
    </KeyboardAvoidingView>
  );
}
