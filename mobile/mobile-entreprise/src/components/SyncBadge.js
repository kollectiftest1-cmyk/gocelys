import { useRouter } from "expo-router";
import { Cloud, CloudOff, RefreshCw } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useSync } from "../lib/sync";
import { colors, font } from "../lib/theme";
import { T } from "./ui";

/** Toujours visible en caisse : état réseau + opérations en attente d'envoi. */
export default function SyncBadge() {
  const { online, pending, rejected, syncing } = useSync();
  const router = useRouter();
  const bg = !online ? colors.coral500 : rejected ? colors.clay500 : pending ? colors.sky600 : colors.night700;
  const fg = !online ? "#FFFFFF" : "#fff";
  const Icon = !online ? CloudOff : syncing ? RefreshCw : Cloud;
  const label = !online ? `Hors ligne${pending ? ` · ${pending}` : ""}` : rejected ? `${rejected} à vérifier` : pending ? `Envoi · ${pending}` : "Synchronisé";
  return (
    <Pressable onPress={() => router.push("/compte")} accessibilityLabel={`État de synchronisation : ${label}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Icon size={14} color={fg} />
        <T style={{ color: fg, fontFamily: font.bold, fontSize: 12 }}>{label}</T>
      </View>
    </Pressable>
  );
}
