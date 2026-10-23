import { Redirect, useRouter } from "expo-router";
import { Boxes, ChevronRight, Store, Truck, UserRound } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import SyncBadge from "../components/SyncBadge";
import { Header, Screen, T } from "../components/ui";
import { useAuth } from "../lib/auth";
import { colors, font } from "../lib/theme";

const MODULES = [
  { key: "caisse", href: "/caisse", title: "Caisse", text: "Vendre, encaisser, clôturer — même sans réseau.", icon: Store, perm: ["sales.create"], tone: colors.brand600 },
  { key: "stock", href: "/stock", title: "Stock", text: "Niveaux, pertes, inventaires et transferts.", icon: Boxes, perm: ["stock.view", "inventory.manage"], tone: colors.sky500 },
  { key: "livraisons", href: "/livraisons", title: "Mes livraisons", text: "Tournée du jour, appel client, preuve de livraison.", icon: Truck, perm: ["deliveries.drive"], tone: colors.leaf500 },
];

export default function Home() {
  const { user, ready, can } = useAuth();
  const router = useRouter();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.night800, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#fff" /></View>;
  if (!user) return <Redirect href="/connexion" />;
  const mods = MODULES.filter((m) => can(...m.perm));
  if (mods.length === 1) return <Redirect href={mods[0].href} />;
  const hour = new Date().getHours();
  return (
    <Screen>
      <Header title={`${hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir"}, ${user.first_name || user.full_name}`}
        subtitle={user.agencies?.map((a) => a.name).join(" · ") || "Gocelsys"}
        right={<SyncBadge />} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
        <T variant="label" color={colors.faint}>Que voulez-vous faire ?</T>
        {mods.map((m) => (
          <Pressable key={m.key} onPress={() => router.push(m.href)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: pressed ? colors.sky50 : "#fff", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.line })}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: m.tone, alignItems: "center", justifyContent: "center" }}>
              <m.icon size={26} color={m.key === "caisse" ? "#FFFFFF" : "#fff"} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h2">{m.title}</T>
              <T variant="small">{m.text}</T>
            </View>
            <ChevronRight color={colors.faint} />
          </Pressable>
        ))}
        {mods.length === 0 && <T color={colors.soft}>Votre rôle ne donne accès à aucun module de l'application. Utilisez l'espace web Gocelsys.</T>}
        <Pressable onPress={() => router.push("/compte")} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
          <UserRound size={18} color={colors.soft} />
          <T style={{ fontFamily: font.semibold, color: colors.soft }}>Mon compte et synchronisation</T>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
