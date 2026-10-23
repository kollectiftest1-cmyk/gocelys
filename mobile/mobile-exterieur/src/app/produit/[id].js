import { useLocalSearchParams, useRouter } from "expo-router";
import { Minus, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ProductArt from "../../components/ProductArt";
import { Button, Empty, T } from "../../components/ui";
import { money, num } from "../../lib/format";
import { useShop } from "../../lib/shop";
import { colors, font, radius } from "../../lib/theme";

export default function Product() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shop = useShop();
  const p = shop.catalog.find((x) => String(x.id) === String(id));
  const [unitId, setUnitId] = useState(() => (p?.units.find((u) => Number(u.factor) === 1) || p?.units[0])?.id);
  const [qty, setQty] = useState(1);
  if (!p) return <Empty title="Produit introuvable" action={<Button title="Retour" variant="outline" onPress={() => router.back()} />} />;
  const unit = p.units.find((u) => u.id === unitId) || p.units[0];
  const perBase = Number(unit.current_price) / Number(unit.factor);
  const saving = Number(unit.factor) > 1 ? Number(p.current_price) * Number(unit.factor) - Number(unit.current_price) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: insets.top + 16, gap: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T variant="xs">{p.category_name}</T>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Fermer"><X color={colors.text} /></Pressable>
        </View>
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <ProductArt visual={p.visual} image={p.image} cutout={p.image_cutout} accent={p.accent || colors.brand500} unit={p.base_unit} size={150} />
        </View>
        <T style={{ fontFamily: font.display, fontSize: 28, letterSpacing: -0.6 }}>{p.name}</T>
        {p.description ? <T color={colors.soft}>{p.description}</T> : null}
        <T variant="label">Format</T>
        <View style={{ gap: 10 }}>
          {p.units.map((u) => {
            const active = u.id === unit.id;
            return (
              <Pressable key={u.id} onPress={() => setUnitId(u.id)} disabled={!u.in_stock}
                style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: active ? colors.brand600 : colors.lineStrong, backgroundColor: active ? colors.brand50 : "#fff", opacity: u.in_stock ? 1 : 0.5 }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: font.bold }}>{u.unit}{Number(u.factor) > 1 ? ` de ${num(u.factor)}` : ""}</T>
                  <T variant="xs">{u.in_stock ? (Number(u.factor) > 1 ? `soit ${money(Number(u.current_price) / Number(u.factor))} l'unité` : "à l'unité") : "Indisponible dans cette agence"}</T>
                </View>
                <T style={{ fontFamily: font.display, fontSize: 18 }}>{money(u.current_price)}</T>
              </Pressable>
            );
          })}
        </View>
        {saving > 0 && <T style={{ color: colors.leaf600, fontFamily: font.semibold }}>Vous économisez {money(saving)} par rapport à l'achat à l'unité.</T>}
        <T variant="xs">Prix de référence : {money(perBase)} par {p.base_unit.toLowerCase()}.</T>
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 18, paddingBottom: insets.bottom + 14, borderTopWidth: 1, borderTopColor: colors.line }}>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 14 }}>
          <Pressable onPress={() => setQty(Math.max(1, qty - 1))} style={{ padding: 14 }} accessibilityLabel="Moins"><Minus size={18} color={colors.text} /></Pressable>
          <T style={{ fontFamily: font.display, fontSize: 20, minWidth: 28, textAlign: "center" }}>{qty}</T>
          <Pressable onPress={() => setQty(qty + 1)} style={{ padding: 14 }} accessibilityLabel="Plus"><Plus size={18} color={colors.text} /></Pressable>
        </View>
        <Button title={`Ajouter · ${money(Number(unit.current_price) * qty)}`} size="lg" style={{ flex: 1 }} disabled={!unit.in_stock}
          onPress={() => { shop.add(p, unit, qty); router.back(); }} />
      </View>
    </View>
  );
}
