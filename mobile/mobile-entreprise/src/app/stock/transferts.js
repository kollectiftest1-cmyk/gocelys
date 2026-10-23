import { useFocusEffect } from "expo-router";
import { ArrowLeftRight, ArrowRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { Banner, Button, Card, Empty, Header, Pill, Screen, T } from "../../components/ui";
import { workAgency } from "../../lib/agency";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { datetime, num } from "../../lib/format";
import { colors, font } from "../../lib/theme";

const ST = { requested: ["Demandé", "coral"], validated: ["Validé", "brand"], shipped: ["En route", "sky"], closed: ["Réceptionné", "leaf"], cancelled: ["Annulé", "neutral"], rejected: ["Refusé", "clay"] };

export default function Transfers() {
  const { user, can } = useAuth();
  const agency = workAgency(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.get("/transfers/", { agency: agency.id, page_size: 40 })).results);
    } catch (e) {
      setMsg({ tone: "clay", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [agency?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const act = async (t, action, text) => {
    try {
      await api.post(`/transfers/${t.id}/${action}/`, {});
      setMsg({ tone: "leaf", text });
      load();
    } catch (e) {
      setMsg({ tone: "clay", text: e.message });
    }
  };
  return (
    <Screen>
      <Header title="Transferts" subtitle={agency?.name} back />
      <FlatList data={rows} keyExtractor={(t) => String(t.id)} contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={msg ? <Banner tone={msg.tone} text={msg.text} style={{ marginBottom: 6 }} /> : null}
        ListEmptyComponent={!loading && <Empty icon={ArrowLeftRight} title="Aucun transfert" text="Les demandes se créent depuis l'espace web." />}
        renderItem={({ item: t }) => {
          const incoming = t.destination === agency.id;
          return (
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T style={{ fontFamily: font.bold }}>{t.reference}</T>
                <Pill label={ST[t.status]?.[0] || t.status} tone={ST[t.status]?.[1]} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <T variant="small">{t.source_name}</T>
                <ArrowRight size={14} color={colors.faint} />
                <T variant="small" style={{ fontFamily: incoming ? font.bold : font.body }}>{t.destination_name}</T>
              </View>
              {t.lines.map((l) => (
                <T key={l.id} variant="xs">{num(l.shipped_quantity ?? l.quantity)} × {l.product_name}</T>
              ))}
              <T variant="xs">{datetime(t.created_at)}</T>
              {t.status === "validated" && !incoming && can("transfers.ship") && (
                <Button title="Confirmer l'expédition" variant="primary" size="sm" onPress={() => act(t, "ship", "Expédié : le stock est passé en transfert.")} />
              )}
              {t.status === "shipped" && incoming && can("transfers.receive") && (
                <Button title="Tout réceptionner" size="sm" onPress={() => act(t, "receive", "Réception enregistrée : stock disponible.")} />
              )}
            </Card>
          );
        }} />
    </Screen>
  );
}
