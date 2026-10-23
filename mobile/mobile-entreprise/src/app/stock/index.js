import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeftRight, ClipboardList, PackageMinus, Search } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";

import { Banner, Empty, Header, Screen, T } from "../../components/ui";
import WaterLevel from "../../components/WaterLevel";
import { workAgency } from "../../lib/agency";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { kvGet, kvSet } from "../../lib/db";
import { ago, num } from "../../lib/format";
import { colors, font } from "../../lib/theme";

const FILTERS = [["", "Tous"], ["low", "Sous le seuil"], ["out", "Ruptures"]];

export default function Stock() {
  const router = useRouter();
  const { user, can } = useAuth();
  const agency = workAgency(user);
  const [data, setData] = useState(() => kvGet(`levels.${agency?.id}`));
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");

  const load = useCallback(async () => {
    if (!agency) return;
    setLoading(true);
    try {
      const d = await api.get("/stock/levels/", { agency: agency.id });
      const cached = { ...d, at: new Date().toISOString() };
      kvSet(`levels.${agency.id}`, cached);
      setData(cached);
      setOffline(false);
    } catch (e) {
      setOffline(e.offline);
    } finally {
      setLoading(false);
    }
  }, [agency?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.results || []).filter((r) => (!state || r.level === state) && (!s || r.product_name.toLowerCase().includes(s)));
  }, [data, q, state]);

  const actions = [
    can("stock.loss") && { label: "Perte ou casse", icon: PackageMinus, href: "/stock/perte" },
    can("inventory.manage") && { label: "Inventaires", icon: ClipboardList, href: "/stock/inventaires" },
    can("transfers.request", "transfers.receive", "transfers.ship") && { label: "Transferts", icon: ArrowLeftRight, href: "/stock/transferts" },
  ].filter(Boolean);

  return (
    <Screen>
      <Header title="Stock" subtitle={agency?.name} back>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          {actions.map((a) => (
            <Pressable key={a.href} onPress={() => router.push(a.href)}
              style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? colors.night600 : colors.night700 })}>
              <a.icon size={20} color={colors.sky300} />
              <T style={{ color: "#fff", fontFamily: font.semibold, fontSize: 12.5 }}>{a.label}</T>
            </Pressable>
          ))}
        </View>
      </Header>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.product)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            {offline && <Banner tone="amber" text={`Hors ligne : niveaux du ${data?.at ? ago(data.at) : "dernier chargement"}.`} />}
            {data?.summary && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[["Ruptures", data.summary.out, colors.clay600], ["Sous le seuil", data.summary.low, colors.amber600], ["Réservés", num(data.summary.reserved), colors.text]].map(([l, v, c]) => (
                  <View key={l} style={{ flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.line }}>
                    <T variant="xs">{l}</T>
                    <T style={{ fontFamily: font.display, fontSize: 22, color: c }}>{v}</T>
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12 }}>
              <Search size={18} color={colors.faint} />
              <TextInput value={q} onChangeText={setQ} placeholder="Chercher un produit" placeholderTextColor={colors.faint} style={{ flex: 1, height: 44, marginLeft: 8, fontFamily: font.body, fontSize: 15 }} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {FILTERS.map(([v, l]) => (
                <Pressable key={v} onPress={() => setState(v)} style={{ paddingHorizontal: 14, height: 34, justifyContent: "center", borderRadius: 999, backgroundColor: state === v ? colors.night800 : "#fff", borderWidth: 1, borderColor: state === v ? colors.night800 : colors.lineStrong }}>
                  <T style={{ fontFamily: font.semibold, fontSize: 13, color: state === v ? "#fff" : colors.text }}>{l}</T>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={!loading && <Empty icon={Search} title="Aucun produit" />}
        renderItem={({ item: r }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#fff", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.line }}>
            <WaterLevel value={r.available} min={r.min_stock} max={r.max_stock} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{r.product_name}</T>
              <T variant="xs">seuil {num(r.min_stock)} · {r.reserved ? `${num(r.reserved)} réservés · ` : ""}{r.in_transit ? `${num(r.in_transit)} en route` : r.category}</T>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <T style={{ fontFamily: font.display, fontSize: 20, color: r.level === "out" ? colors.clay600 : r.level === "low" ? colors.amber600 : colors.text }}>{num(r.available)}</T>
              <T variant="xs">{r.unit.toLowerCase()}s</T>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}
