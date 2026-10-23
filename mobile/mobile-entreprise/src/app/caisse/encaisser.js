import { useRouter } from "expo-router";
import { Banknote, CheckCircle2, CloudOff, Smartphone, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, Button, T } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { kvGet } from "../../lib/db";
import { money, num } from "../../lib/format";
import { recordSale } from "../../lib/pos";
import { useSync } from "../../lib/sync";
import { colors, font, radius } from "../../lib/theme";
import { CartLines } from "../../modules/CartPanel";

function Done({ sale, onNext }) {
  const insets = useSafeAreaInsets();
  const { online } = useSync();
  return (
    <View style={{ flex: 1, backgroundColor: colors.night800, padding: 24, paddingTop: insets.top + 40, gap: 18 }}>
      <CheckCircle2 size={56} color="#6BE3A1" />
      <T style={{ fontFamily: font.display, fontSize: 32, color: "#fff", letterSpacing: -0.8 }}>Vente encaissée</T>
      <T color={colors.onNightSoft}>Ticket {sale.local_ref} · {sale.method.name}</T>
      {sale.change > 0 && (
        <View style={{ backgroundColor: "#103F2B", borderRadius: 18, padding: 20 }}>
          <T color="#9BE7BE" style={{ fontFamily: font.semibold }}>Monnaie à rendre</T>
          <T style={{ fontFamily: font.display, fontSize: 44, color: "#fff" }}>{money(sale.change)}</T>
        </View>
      )}
      <View style={{ backgroundColor: colors.night700, borderRadius: 18, padding: 18, gap: 6 }}>
        {sale.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T color={colors.onNight} style={{ flex: 1 }} numberOfLines={1}>{l.quantity} × {l.label}</T>
            <T color="#fff">{money(l.price * l.quantity)}</T>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <T color="#fff" style={{ fontFamily: font.bold }}>Total</T>
          <T color="#fff" style={{ fontFamily: font.display, fontSize: 20 }}>{money(sale.total)}</T>
        </View>
      </View>
      {!online && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <CloudOff size={16} color={colors.coral500} />
          <T color={colors.coral500} style={{ flex: 1 }}>Enregistrée sur l'appareil. Elle sera envoyée au serveur au retour du réseau.</T>
        </View>
      )}
      <View style={{ flex: 1 }} />
      <Button title="Vente suivante" size="lg" onPress={onNext} style={{ marginBottom: insets.bottom }} />
    </View>
  );
}

export default function Checkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { can } = useAuth();
  const cart = useCart();
  const { syncNow, refreshCounts } = useSync();
  const methods = useMemo(() => kvGet("catalog")?.payment_methods || [], []);
  const [method, setMethod] = useState(methods[0]);
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [discount, setDiscount] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const total = Math.max(0, cart.subtotal - Number(discount || 0));
  const paid = method?.kind === "cash" ? Number(received || total) : total;
  const change = method?.kind === "cash" ? Math.max(0, paid - total) : 0;
  const quick = [...new Set([total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000, Math.ceil(total / 20000) * 20000])].filter((v) => v > 0).slice(0, 4);

  if (done) return <Done sale={done} onNext={() => { setDone(null); router.back(); }} />;

  const confirm = () => {
    setError("");
    if (!cart.lines.length) return setError("Le panier est vide.");
    if (!method) return setError("Choisissez un moyen de paiement.");
    if (method.requires_reference && !reference.trim()) return setError(`Saisissez la référence de la transaction ${method.name}.`);
    if (paid < total) return setError("Le montant reçu est inférieur au total.");
    try {
      const sale = recordSale({ cart: cart.lines, method, received: paid, reference: reference.trim(), discount });
      cart.clear();
      refreshCounts();
      syncNow();
      setDone(sale);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, paddingTop: insets.top + 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <T variant="h1">Encaisser</T>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Fermer"><X size={24} color={colors.text} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: "#fff", borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line }}>
          <CartLines />
        </View>
        {can("sales.discount") && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T variant="label">Remise (FC)</T>
            <TextInput value={discount} onChangeText={setDiscount} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.faint}
              style={{ width: 140, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", textAlign: "right", paddingHorizontal: 12, fontFamily: font.semibold, fontSize: 16 }} />
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <T color={colors.soft} style={{ fontFamily: font.semibold }}>À payer</T>
          <T variant="big">{money(total)}</T>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {methods.map((m) => {
            const active = method?.id === m.id;
            const Icon = m.kind === "cash" ? Banknote : Smartphone;
            return (
              <Pressable key={m.id} onPress={() => setMethod(m)}
                style={{ flexBasis: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.brand600 : colors.lineStrong, backgroundColor: active ? colors.brand50 : "#fff" }}>
                <Icon size={20} color={active ? colors.brand600 : colors.faint} />
                <T style={{ fontFamily: font.bold, color: active ? colors.brand700 : colors.text }}>{m.name}</T>
              </Pressable>
            );
          })}
        </View>
        {method?.kind === "cash" ? (
          <View style={{ gap: 10 }}>
            <T variant="label">Montant reçu</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {quick.map((v) => (
                <Pressable key={v} onPress={() => setReceived(String(v))}
                  style={{ flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Number(received) === v ? colors.night800 : "#fff", borderWidth: 1, borderColor: Number(received) === v ? colors.night800 : colors.lineStrong }}>
                  <T style={{ fontFamily: font.bold, fontSize: 14, color: Number(received) === v ? "#fff" : colors.text }}>{num(v)}</T>
                </Pressable>
              ))}
            </View>
            <TextInput value={received} onChangeText={setReceived} keyboardType="number-pad" placeholder={`${num(total)} (montant exact)`} placeholderTextColor={colors.faint}
              style={{ height: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", paddingHorizontal: 16, fontFamily: font.display, fontSize: 22, color: colors.text }} />
            {change > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.leaf100, padding: 14, borderRadius: 14 }}>
                <T style={{ fontFamily: font.bold, color: "#0F5C34" }}>Monnaie à rendre</T>
                <T style={{ fontFamily: font.display, fontSize: 20, color: "#0F5C34" }}>{money(change)}</T>
              </View>
            )}
          </View>
        ) : method ? (
          <View style={{ gap: 8 }}>
            <T variant="label">Référence de la transaction {method.name}</T>
            <TextInput value={reference} onChangeText={setReference} autoCapitalize="characters" placeholder="Ex. MP261019.1432.A12345" placeholderTextColor={colors.faint}
              style={{ height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 16 }} />
          </View>
        ) : null}
        {error ? <Banner tone="clay" text={error} /> : null}
      </ScrollView>
      <View style={{ padding: 18, paddingBottom: insets.bottom + 14, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button title={`Encaisser ${money(total)}`} size="lg" onPress={confirm} disabled={!cart.lines.length} />
      </View>
    </KeyboardAvoidingView>
  );
}
