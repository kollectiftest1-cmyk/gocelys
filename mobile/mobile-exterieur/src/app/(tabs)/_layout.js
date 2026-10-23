import { Redirect, Tabs } from "expo-router";
import { House, ReceiptText, UserRound } from "lucide-react-native";

import { useAuth } from "../../lib/auth";
import { colors, font } from "../../lib/theme";

export default function TabsLayout() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/bienvenue" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
        tabBarStyle: { borderTopColor: colors.line, height: 64, paddingTop: 6 },
      }}>
      <Tabs.Screen name="accueil" options={{ title: "Commander", tabBarIcon: ({ color }) => <House color={color} size={22} /> }} />
      <Tabs.Screen name="commandes" options={{ title: "Mes commandes", tabBarIcon: ({ color }) => <ReceiptText color={color} size={22} /> }} />
      <Tabs.Screen name="compte" options={{ title: "Compte", tabBarIcon: ({ color }) => <UserRound color={color} size={22} /> }} />
    </Tabs>
  );
}
