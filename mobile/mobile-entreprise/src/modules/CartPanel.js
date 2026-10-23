import { Minus, Plus, ScanBarcode } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { Button, T } from "../components/ui";
import { useCart } from "../lib/cart";
import { money, num } from "../lib/format";
import { colors, font } from "../lib/theme";

export function CartLines({ editable = true }) {
  const cart = useCart();
  if (!cart.lines.length) {
    return (
      <View style={{ alignItems: "center", gap: 8, padding: 32 }}>
        <ScanBarcode size={30} color={colors.faint} />
        <T color={colors.faint}>Scannez ou touchez un produit</T>
      </View>
    );
  }
  return cart.lines.map((l) => (
    <View key={l.unit.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{l.product.name}</T>
        <T variant="xs">{l.unit.unit_name}{Number(l.unit.factor) > 1 ? ` de ${num(l.unit.factor)}` : ""} · {money(l.unit.current_price)}</T>
      </View>
      {editable ? (
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 10 }}>
          <Pressable onPress={() => cart.setQty(l.unit.id, l.quantity - 1)} hitSlop={6} style={{ padding: 8 }} accessibilityLabel="Moins"><Minus size={16} color={colors.text} /></Pressable>
          <T style={{ fontFamily: font.bold, minWidth: 26, textAlign: "center" }}>{l.quantity}</T>
          <Pressable onPress={() => cart.setQty(l.unit.id, l.quantity + 1)} hitSlop={6} style={{ padding: 8 }} accessibilityLabel="Plus"><Plus size={16} color={colors.text} /></Pressable>
        </View>
      ) : <T>× {l.quantity}</T>}
      <T style={{ fontFamily: font.bold, minWidth: 86, textAlign: "right" }}>{money(Number(l.unit.current_price) * l.quantity)}</T>
    </View>
  ));
}

export default function CartPanel({ onCheckout }) {
  const cart = useCart();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <T variant="h3">Ticket en cours</T>
        {cart.lines.length > 0 && <Pressable onPress={cart.clear}><T style={{ color: colors.clay600, fontFamily: font.semibold }}>Vider</T></Pressable>}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16 }}><CartLines /></ScrollView>
      <View style={{ padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.sunk }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <T color={colors.soft}>À payer</T>
          <T variant="big" style={{ fontSize: 28 }}>{money(cart.subtotal)}</T>
        </View>
        <Button title="Encaisser" size="lg" disabled={!cart.lines.length} onPress={onCheckout} />
      </View>
    </View>
  );
}
