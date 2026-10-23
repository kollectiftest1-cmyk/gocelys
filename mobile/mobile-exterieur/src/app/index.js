import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../lib/auth";
import { colors } from "../lib/theme";

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.night800, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#fff" /></View>;
  return <Redirect href={user ? "/accueil" : "/bienvenue"} />;
}
