import { useFocusEffect, useRouter } from "expo-router";
import { ClipboardList } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { Banner, Button, Card, Empty, Header, Pill, Screen, T } from "../../components/ui";
import { workAgency } from "../../lib/agency";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { datetime } from "../../lib/format";
import { colors, font } from "../../lib/theme";

const ST = { draft: ["Comptage en cours", "sky"], submitted: ["À valider", "coral"], validated: ["Validé", "leaf"], cancelled: ["Annulé", "neutral"] };

export default function Inventories() {
  const router = useRouter();
  const { user } = useAuth();
  const agency = workAgency(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get("/inventories/", { agency: agency.id });
      setRows(d.results);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [agency?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const start = async () => {
    try {
      const inv = await api.post("/inventories/", { agency: agency.id, scope_note: "Comptage mobile" });
      router.push(`/stock/inventaire/${inv.id}`);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Screen>
      <Header title="Inventaires" subtitle={agency?.name} back />
      <FlatList data={rows} keyExtractor={(i) => String(i.id)} contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={<View style={{ gap: 10, marginBottom: 6 }}>
          {error ? <Banner tone="clay" text={error} /> : null}
          <Button title="Lancer un comptage" onPress={start} />
        </View>}
        ListEmptyComponent={!loading && <Empty icon={ClipboardList} title="Aucun inventaire" />}
        renderItem={({ item: i }) => (
          <Card onPress={() => router.push(`/stock/inventaire/${i.id}`)} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T style={{ fontFamily: font.bold }}>{i.reference}</T>
              <Pill label={ST[i.status][0]} tone={ST[i.status][1]} />
            </View>
            <T variant="small">{i.scope_note || "Tous les produits"} · {datetime(i.created_at)}</T>
            <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.sky500, width: `${(i.progress.counted / Math.max(1, i.progress.total)) * 100}%` }} />
            </View>
            <T variant="xs">{i.progress.counted} / {i.progress.total} comptés{i.progress.gaps ? ` · ${i.progress.gaps} écart(s)` : ""}</T>
          </Card>
        )} />
    </Screen>
  );
}
