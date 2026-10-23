import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, LogOut, MapPin, Star, Store } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, T } from "../../components/ui";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { money, num } from "../../lib/format";
import { useShop } from "../../lib/shop";
import { colors, font } from "../../lib/theme";

export default function Account() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const shop = useShop();
  const [profile, setProfile] = useState(null);
  const [addresses, setAddresses] = useState([]);
  useFocusEffect(useCallback(() => {
    api.get("/shop/profile/").then(setProfile).catch(() => {});
    api.get("/shop/addresses/").then(setAddresses).catch(() => {});
  }, []));
  const points = profile?.loyalty_points ?? user?.customer?.loyalty_points ?? 0;
  const remove = async (id) => {
    await api.del(`/shop/addresses/${id}/`).catch(() => {});
    setAddresses((a) => a.filter((x) => x.id !== id));
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ backgroundColor: colors.night800, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 26 }}>
        <T style={{ fontFamily: font.display, fontSize: 28, color: "#fff" }}>{profile?.name || user?.full_name}</T>
        <T color={colors.onNightSoft}>{user?.phone}</T>
      </View>
      <View style={{ padding: 16, gap: 14, marginTop: -14 }}>
        <View style={{ backgroundColor: colors.coral500, borderRadius: 20, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Star size={34} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <T style={{ color: "rgba(255,255,255,0.82)", fontFamily: font.semibold }}>Points fidélité</T>
            <T style={{ fontFamily: font.display, fontSize: 30, color: "#FFFFFF" }}>{num(points)}</T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T variant="xs" color="rgba(255,255,255,0.82)">{profile?.orders_count ?? 0} commande(s)</T>
            <T variant="xs" color="rgba(255,255,255,0.82)">{money(profile?.total_spent || 0)}</T>
          </View>
        </View>
        <Pressable onPress={() => router.push("/agence")}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Store size={20} color={colors.brand600} />
            <View style={{ flex: 1 }}>
              <T variant="xs">Mon agence</T>
              <T style={{ fontFamily: font.semibold }}>{shop.agency?.name || "Choisir"}</T>
            </View>
            <ChevronRight color={colors.faint} />
          </Card>
        </Pressable>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T variant="h3">Mes adresses</T>
            <Pressable onPress={() => router.push("/adresse")}><T style={{ color: colors.brand600, fontFamily: font.bold }}>+ Ajouter</T></Pressable>
          </View>
          {addresses.length === 0 && <T variant="small">Aucune adresse enregistrée.</T>}
          {addresses.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 6 }}>
              <MapPin size={16} color={colors.faint} />
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.semibold }}>{a.label}{a.is_default ? " · par défaut" : ""}</T>
                <T variant="xs">{a.line}{a.zone_name ? ` · ${a.zone_name}` : ""}</T>
              </View>
              <Pressable onPress={() => remove(a.id)} hitSlop={8}><T variant="xs" color={colors.clay600}>Supprimer</T></Pressable>
            </View>
          ))}
        </Card>
        <Button title="Se déconnecter" icon={LogOut} variant="danger" onPress={async () => { await logout(); router.replace("/bienvenue"); }} />
        <T variant="xs" style={{ textAlign: "center" }}>Gocelsys · produits du quotidien</T>
      </View>
    </ScrollView>
  );
}
