import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, MapPin, Truck } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Switch, View } from "react-native";

import { Banner, Empty, Header, Pill, Screen, T } from "../../components/ui";
import { api } from "../../lib/api";
import { kvGet, kvSet } from "../../lib/db";
import { money, time } from "../../lib/format";
import { DSTATUS } from "../../lib/status";
import { colors, font } from "../../lib/theme";


export default function Deliveries() {
  const router = useRouter();
  const [rows, setRows] = useState(() => kvGet("deliveries") || []);
  const [summary, setSummary] = useState(() => kvGet("deliveries.summary"));
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([api.get("/my/deliveries/", { scope: "today" }), api.get("/my/deliveries/summary/")]);
      setRows(list);
      setSummary(sum);
      kvSet("deliveries", list);
      kvSet("deliveries.summary", sum);
      setOffline(false);
    } catch (e) {
      setOffline(e.offline);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (v) => {
    setSummary((s) => ({ ...s, is_available: v }));
    try {
      await api.post("/my/deliveries/availability/", { is_available: v });
    } catch {
      setSummary((s) => ({ ...s, is_available: !v }));
    }
  };

  const active = rows.filter((d) => !["delivered", "failed"].includes(d.status));
  const done = rows.filter((d) => ["delivered", "failed"].includes(d.status));

  return (
    <Screen>
      <Header title="Mes livraisons" subtitle={summary?.agency} back
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T variant="xs" color={colors.onNightSoft}>{summary?.is_available ? "Disponible" : "En pause"}</T>
            <Switch value={Boolean(summary?.is_available)} onValueChange={toggle} trackColor={{ true: colors.leaf500, false: colors.night600 }} thumbColor="#fff" />
          </View>
        }>
        {summary && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            {[["En cours", summary.active], ["Livrées aujourd'hui", summary.delivered_today], ["Encaissé", money(summary.cash_collected_today)]].map(([l, v]) => (
              <View key={l} style={{ flex: 1, backgroundColor: colors.night700, borderRadius: 14, padding: 12 }}>
                <T variant="xs" color={colors.onNightSoft}>{l}</T>
                <T style={{ fontFamily: font.display, fontSize: 19, color: "#fff" }} numberOfLines={1}>{v}</T>
              </View>
            ))}
          </View>
        )}
      </Header>
      <FlatList
        data={[...active, ...done]}
        keyExtractor={(d) => String(d.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={offline ? <Banner tone="amber" text="Hors ligne : dernière liste connue." style={{ marginBottom: 6 }} /> : null}
        ListEmptyComponent={!loading && <Empty icon={Truck} title="Aucune livraison" text="Les livraisons affectées par l'agence apparaîtront ici." />}
        renderItem={({ item: d }) => {
          const [label, tone] = DSTATUS[d.status] || [d.status, "neutral"];
          const finished = ["delivered", "failed"].includes(d.status);
          return (
            <Pressable onPress={() => router.push(`/livraisons/${d.id}`)}
              style={({ pressed }) => ({ backgroundColor: pressed ? colors.sky50 : "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: d.status === "assigned" ? colors.coral500 : colors.line, opacity: finished ? 0.65 : 1, gap: 8 })}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Pill label={label} tone={tone} />
                <T variant="xs">{time(d.assigned_at)}</T>
              </View>
              <T variant="h3">{d.customer_name}</T>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                <MapPin size={15} color={colors.faint} style={{ marginTop: 2 }} />
                <T variant="small" style={{ flex: 1 }} numberOfLines={2}>{d.address_text}</T>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T variant="xs">{d.order_reference} · {d.lines.length} ligne(s)</T>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <T style={{ fontFamily: font.display, fontSize: 17 }}>{d.payment_status === "paid" ? "Payée" : money(d.total)}</T>
                  <ChevronRight size={18} color={colors.faint} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
