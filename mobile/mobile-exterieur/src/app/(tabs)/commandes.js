import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, ReceiptText } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Empty, Pill, T } from "../../components/ui";
import { api } from "../../lib/api";
import { datetime, money } from "../../lib/format";
import { ORDER } from "../../lib/status";
import { colors, font } from "../../lib/theme";

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.get("/shop/orders/", { page_size: 50 })).results || []);
    } catch {
      /* hors ligne : la liste reste affichée */
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const open = rows.filter((o) => !["completed", "cancelled", "refused", "refunded"].includes(o.status));
  const past = rows.filter((o) => ["completed", "cancelled", "refused", "refunded"].includes(o.status));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.night800, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 18 }}>
        <T style={{ fontFamily: font.display, fontSize: 28, color: "#fff" }}>Mes commandes</T>
        <T color={colors.onNightSoft}>{open.length ? `${open.length} en cours` : "Aucune commande en cours"}</T>
      </View>
      <FlatList
        data={[...open, ...past]}
        keyExtractor={(o) => String(o.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={!loading && <Empty icon={ReceiptText} title="Pas encore de commande" text="Vos commandes et leur suivi apparaîtront ici." action={<Button title="Commander" onPress={() => router.push("/accueil")} />} />}
        renderItem={({ item: o }) => {
          const [label, tone] = ORDER[o.status] || [o.status_label, "neutral"];
          const active = open.includes(o);
          return (
            <Pressable onPress={() => router.push(`/commande/${o.id}`)}
              style={({ pressed }) => ({ backgroundColor: pressed ? colors.sky50 : "#fff", borderRadius: 18, padding: 16, borderWidth: active ? 1.5 : 1, borderColor: active ? colors.sky500 : colors.line, gap: 6 })}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Pill label={label} tone={tone} />
                <T variant="xs">{datetime(o.created_at)}</T>
              </View>
              <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{o.lines.map((l) => l.label).join(", ")}</T>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T variant="xs">{o.reference} · {o.fulfillment === "pickup" ? "Retrait" : "Livraison"}</T>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <T style={{ fontFamily: font.display, fontSize: 17 }}>{money(o.total)}</T>
                  <ChevronRight size={18} color={colors.faint} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
