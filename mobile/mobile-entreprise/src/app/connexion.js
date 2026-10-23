import { useRouter } from "expo-router";
import { Server } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Banner, Button, Field, Logo, T } from "../components/ui";
import { getServer, setServer } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, font } from "../lib/theme";

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServerState] = useState(getServer());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!identifier || !password) return setError("Saisissez votre identifiant et votre mot de passe.");
    setBusy(true);
    try {
      setServer(server);
      await login(identifier.trim(), password);
      router.replace("/");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.night800 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: insets.top + 32, paddingHorizontal: 24, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Logo size={44} />
            <View>
              <T style={{ fontFamily: font.display, fontSize: 26, color: "#fff" }}>Gocelsys</T>
              <T variant="small" color={colors.sky300}>Entreprise · caisse, stock, livraisons</T>
            </View>
          </View>
          <T style={{ fontFamily: font.display, fontSize: 34, lineHeight: 38, color: "#fff", marginTop: 36, letterSpacing: -1 }}>
            Vendez, même quand le réseau coupe.
          </T>
          <T color={colors.onNightSoft} style={{ marginTop: 10 }}>Les ventes restent sur l'appareil et partent au serveur dès le retour de la connexion.</T>
        </View>
        <Svg viewBox="0 0 400 40" width="100%" height={40} preserveAspectRatio="none">
          <Path d="M0 20 C 70 0, 130 40, 200 20 S 330 0, 400 20 V40 H0Z" fill={colors.bg} />
        </Svg>
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, gap: 16, paddingBottom: insets.bottom + 24 }}>
          <T variant="h1">Connexion</T>
          <Field label="Identifiant ou téléphone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} placeholder="caisse.matadi" />
          <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" onSubmitEditing={submit} />
          {error ? <Banner tone="clay" text={error} /> : null}
          <Button title="Se connecter" onPress={submit} loading={busy} size="lg" />
          <Pressable onPress={() => setShowServer((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", padding: 8 }}>
            <Server size={16} color={colors.soft} />
            <T variant="small">Serveur : {server.replace(/^https?:\/\//, "")}</T>
          </Pressable>
          {showServer && <Field label="Adresse du serveur Gocelsys" value={server} onChangeText={setServerState} autoCapitalize="none" keyboardType="url" hint="Ex. http://192.168.1.10:8000 sur le réseau de l'agence" />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
