import { CheckCircle2, Clock, CloudOff, XCircle } from "lucide-react-native";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import SyncBadge from "../../components/SyncBadge";
import { Empty, Header, Screen, T } from "../../components/ui";
import { money, time } from "../../lib/format";
import { sessionSummary } from "../../lib/pos";
import { useSync } from "../../lib/sync";
import { colors, font } from "../../lib/theme";

const STATUS = {
  pending: { icon: Clock, color: colors.amber600, label: "En attente d'envoi" },
  synced: { icon: CheckCircle2, color: colors.leaf600, label: "Synchronisée" },
  rejected: { icon: XCircle, color: colors.clay600, label: "Refusée par le serveur" },
};

export default function Sales() {
  const { syncNow, syncing } = useSync();
  const [summary, setSummary] = useState(() => sessionSummary());
  const reload = async () => {
    await syncNow();
    setSummary(sessionSummary());
  };
  return (
    <Screen>
      <Header title="Ventes de la session" subtitle={summary ? `${summary.count} ticket(s) · ${money(summary.total)}` : ""} back right={<SyncBadge />} />
      <FlatList
        data={summary?.sales || []}
        keyExtractor={(s) => s.client_uuid}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={reload} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={summary && Object.keys(summary.by_method).length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            {Object.entries(summary.by_method).map(([m, v]) => (
              <View key={m} style={{ backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line }}>
                <T variant="xs">{m}</T>
                <T style={{ fontFamily: font.bold }}>{money(v)}</T>
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={<Empty icon={CloudOff} title="Aucune vente" text="Les ventes de cette session apparaîtront ici." />}
        renderItem={({ item: s }) => {
          const st = STATUS[s.status] || STATUS.pending;
          return (
            <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.line, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T style={{ fontFamily: font.bold }}>{s.server_ref || s.local_ref}</T>
                <T style={{ fontFamily: font.display, fontSize: 17 }}>{money(s.total)}</T>
              </View>
              <T variant="small" numberOfLines={2}>{s.payload.lines.map((l) => `${l.quantity} × ${l.label}`).join(", ")}</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <st.icon size={14} color={st.color} />
                <T variant="xs" color={st.color}>{st.label}</T>
                <T variant="xs" style={{ marginLeft: "auto" }}>{time(s.created_at)} · {s.payload.method.name}</T>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}
