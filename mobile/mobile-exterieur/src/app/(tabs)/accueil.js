import { useRouter } from "expo-router";
import { ChevronDown, MapPin, Plus, Search, ShoppingBasket } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ProductArt from "../../components/ProductArt";
import { Banner, Empty, T } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { money, num } from "../../lib/format";
import { useShop } from "../../lib/shop";
import { colors, font } from "../../lib/theme";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const shop = useShop();
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState("");
  const cols = width > 600 ? 3 : 2;

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return shop.catalog.filter((p) => (!cat || p.category === cat) && (!s || p.name.toLowerCase().includes(s)));
  }, [shop.catalog, cat, q]);

  const categories = (shop.boot?.categories || []).filter((c) => shop.catalog.some((p) => p.category === c.id));
  const name = (user?.customer?.name || user?.full_name || "").split(" ");
  const first = ["mme", "m.", "mr", "papa", "maman", "sœur", "soeur", "frère"].includes((name[0] || "").toLowerCase()) ? name.slice(0, 2).join(" ") : name[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.night800, paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 18 }}>
        <Pressable onPress={() => router.push("/agence")} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MapPin size={15} color={colors.sky300} />
          <T variant="small" color={colors.sky300} style={{ fontFamily: font.semibold }}>{shop.agency ? shop.agency.name : "Choisir une agence"}</T>
          <ChevronDown size={15} color={colors.sky300} />
        </Pressable>
        <T style={{ fontFamily: font.display, fontSize: 28, color: "#fff", marginTop: 8, letterSpacing: -0.6 }}>Bonjour {first},{"\n"}que vous faut-il ?</T>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.night700, borderRadius: 14, paddingHorizontal: 14, marginTop: 14 }}>
          <Search size={18} color={colors.onNightSoft} />
          <TextInput value={q} onChangeText={setQ} placeholder="Eau, jus, riz…" placeholderTextColor={colors.onNightSoft}
            style={{ flex: 1, height: 48, color: "#fff", fontFamily: font.body, fontSize: 16, marginLeft: 8 }} />
        </View>
      </View>
      <FlatList
        key={cols}
        data={items}
        numColumns={cols}
        keyExtractor={(p) => String(p.id)}
        refreshControl={<RefreshControl refreshing={shop.loading} onRefresh={shop.reload} />}
        contentContainerStyle={{ padding: 10, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 6 }}>
            {shop.error ? <Banner tone="amber" text="Catalogue hors ligne : prix et disponibilités peuvent avoir changé." /> : null}
            <View style={{ backgroundColor: colors.coral500, borderRadius: 20, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden" }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.display, fontSize: 21, color: "#FFFFFF" }}>Livraison dans votre quartier</T>
                <T style={{ color: "rgba(255,255,255,0.82)", marginTop: 2 }}>{shop.zones.length ? `${shop.zones.map((z) => z.name).slice(0, 3).join(", ")}… dès ${money(Math.min(...shop.zones.map((z) => Number(z.fee))))}` : "Ou retrait gratuit en agence"}</T>
              </View>
              <ProductArt accent="#FFFFFF" unit="bouteille" size={58} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[{ id: null, name: "Tout" }, ...categories].map((c) => (
                <Pressable key={c.id ?? "all"} onPress={() => setCat(c.id)}
                  style={{ paddingHorizontal: 16, height: 38, justifyContent: "center", borderRadius: 999, backgroundColor: cat === c.id ? colors.night800 : "#fff", borderWidth: 1, borderColor: cat === c.id ? colors.night800 : colors.lineStrong }}>
                  <T style={{ fontFamily: font.semibold, color: cat === c.id ? "#fff" : colors.text }}>{c.name}</T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={!shop.loading && <Empty icon={Search} title="Aucun produit" text={shop.agency ? "Essayez une autre recherche." : "Choisissez d'abord votre agence."} />}
        renderItem={({ item: p }) => {
          const unit = p.units.find((u) => Number(u.factor) === 1) || p.units[0];
          const promo = Number(p.current_price) < Number(p.price);
          return (
            <View style={{ flex: 1 / cols, padding: 5 }}>
              <Pressable onPress={() => router.push(`/produit/${p.id}`)}
                style={({ pressed }) => ({ backgroundColor: "#fff", borderRadius: 20, padding: 14, borderWidth: 1, borderColor: colors.line, opacity: p.in_stock ? 1 : 0.55, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <ProductArt visual={p.visual} image={p.image} cutout={p.image_cutout} accent={p.accent || colors.brand500} unit={p.base_unit} />
                {promo && <View style={{ position: "absolute", top: 12, right: 12, backgroundColor: colors.coral500, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}><T style={{ fontFamily: font.bold, fontSize: 11, color: "#FFFFFF" }}>Promo</T></View>}
                <T style={{ fontFamily: font.semibold, marginTop: 10, minHeight: 42 }} numberOfLines={2}>{p.name}</T>
                <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 }}>
                  <View>
                    <T style={{ fontFamily: font.display, fontSize: 18 }}>{money(p.current_price)}</T>
                    {promo ? <T variant="xs" style={{ textDecorationLine: "line-through" }}>{money(p.price)}</T> : <T variant="xs">{p.in_stock ? `par ${p.base_unit.toLowerCase()}` : "Épuisé"}</T>}
                  </View>
                  <Pressable disabled={!p.in_stock} onPress={() => shop.add(p, unit)} hitSlop={8} accessibilityLabel={`Ajouter ${p.name}`}
                    style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 12, backgroundColor: pressed ? colors.brand700 : colors.brand600, alignItems: "center", justifyContent: "center" })}>
                    <Plus color="#fff" size={20} />
                  </Pressable>
                </View>
              </Pressable>
            </View>
          );
        }}
      />
      {shop.count > 0 && (
        <Pressable onPress={() => router.push("/panier")}
          style={({ pressed }) => ({ position: "absolute", left: 14, right: 14, bottom: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.night800, borderRadius: 18, padding: 14, transform: [{ scale: pressed ? 0.98 : 1 }], shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 })}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.brand500, alignItems: "center", justifyContent: "center" }}>
            <ShoppingBasket color="#FFFFFF" size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.bold, color: "#fff" }}>Voir le panier</T>
            <T variant="xs" color={colors.onNightSoft}>{num(shop.count)} article{shop.count > 1 ? "s" : ""}</T>
          </View>
          <T style={{ fontFamily: font.display, fontSize: 20, color: "#fff" }}>{money(shop.subtotal)}</T>
        </Pressable>
      )}
    </View>
  );
}
