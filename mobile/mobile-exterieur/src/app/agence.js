import { useRouter } from "expo-router";
import { Check, Clock, MapPin, Phone } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { Header, Screen, T } from "../components/ui";
import { useShop } from "../lib/shop";
import { colors, font } from "../lib/theme";

const DAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export default function Agency() {
  const router = useRouter();
  const shop = useShop();
  const today = DAYS[new Date().getDay()];
  return (
    <Screen>
      <Header title="Choisir mon agence" subtitle="Le catalogue et les délais dépendent de l'agence" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {shop.agencies.map((a) => {
          const active = shop.agency?.id === a.id;
          return (
            <Pressable key={a.id} onPress={() => { shop.setAgency(a.id); router.back(); }}
              style={{ backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: active ? colors.brand600 : colors.line, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T variant="h3">{a.name}</T>
                {active && <Check color={colors.brand600} />}
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}><MapPin size={15} color={colors.faint} /><T variant="small" style={{ flex: 1 }}>{a.address}, {a.city}</T></View>
              {a.opening_hours?.[today] && <View style={{ flexDirection: "row", gap: 6 }}><Clock size={15} color={colors.faint} /><T variant="small">Aujourd'hui {a.opening_hours[today].replace("-", " – ")}</T></View>}
              {a.phone ? <View style={{ flexDirection: "row", gap: 6 }}><Phone size={15} color={colors.faint} /><T variant="small">{a.phone}</T></View> : null}
            </Pressable>
          );
        })}
        <T variant="xs" style={{ textAlign: "center", marginTop: 6 }}>Si un produit manque dans votre agence, Gocelsys peut confier la commande à une autre agence.</T>
      </ScrollView>
    </Screen>
  );
}
