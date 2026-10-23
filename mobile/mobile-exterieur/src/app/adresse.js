import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { LocateFixed } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Banner, Button, Field, Header, Screen, T } from "../components/ui";
import { api } from "../lib/api";
import { useShop } from "../lib/shop";
import { colors, font, radius } from "../lib/theme";

export default function NewAddress() {
  const router = useRouter();
  const shop = useShop();
  const [f, setF] = useState({ label: "Domicile", line: "", landmark: "", zone: null, latitude: null, longitude: null });
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState("");
  const [error, setError] = useState("");
  const set = (k) => (v) => setF({ ...f, [k]: v });

  const locate = async () => {
    setGps("Recherche de votre position…");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return setGps("Position refusée : saisissez simplement l'adresse.");
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setF((x) => ({ ...x, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
      setGps("Position enregistrée : le livreur vous trouvera plus facilement.");
    } catch {
      setGps("Position indisponible pour le moment.");
    }
  };

  const save = async () => {
    if (!f.line.trim()) return setError("Indiquez l'avenue et le numéro.");
    setBusy(true);
    try {
      await api.post("/shop/addresses/", { ...f, city: shop.agency?.city || "" });
      router.back();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Nouvelle adresse" subtitle="Pour la livraison à domicile" back />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["Domicile", "Bureau", "Boutique"].map((l) => (
            <Pressable key={l} onPress={() => set("label")(l)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: f.label === l ? colors.brand600 : colors.lineStrong, backgroundColor: f.label === l ? colors.brand50 : "#fff" }}>
              <T style={{ fontFamily: font.semibold }}>{l}</T>
            </Pressable>
          ))}
        </View>
        <Field label="Avenue et numéro" value={f.line} onChangeText={set("line")} placeholder="Av. Kinkanda 14" />
        <Field label="Point de repère" value={f.landmark} onChangeText={set("landmark")} placeholder="En face de l'église, portail bleu" />
        <T variant="label">Quartier</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {shop.zones.map((z) => (
            <Pressable key={z.id} onPress={() => set("zone")(z.id)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: f.zone === z.id ? colors.brand600 : colors.lineStrong, backgroundColor: f.zone === z.id ? colors.brand50 : "#fff" }}>
              <T style={{ fontFamily: font.semibold }}>{z.name}</T>
            </Pressable>
          ))}
        </View>
        <Button title="Utiliser ma position actuelle" icon={LocateFixed} variant="outline" onPress={locate} />
        {gps ? <T variant="small">{gps}</T> : null}
        {error ? <Banner tone="clay" text={error} /> : null}
        <Button title="Enregistrer l'adresse" size="lg" loading={busy} onPress={save} />
      </ScrollView>
    </Screen>
  );
}
