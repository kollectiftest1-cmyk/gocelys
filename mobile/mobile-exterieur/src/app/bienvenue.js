import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { Banner, Button, Field, Logo, T } from "../components/ui";
import { getServer, setServer } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, font, radius } from "../lib/theme";

function Bottle({ x, h, fill }) {
  return (
    <>
      <Rect x={x + 14} y={160 - h - 18} width="12" height="10" rx="3" fill={colors.coral500} />
      <Rect x={x} y={160 - h - 8} width="40" height={h + 8} rx="12" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" />
      <Rect x={x + 3} y={160 - h * fill} width="34" height={h * fill - 3} rx="9" fill="url(#water)" />
    </>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState({ name: "", phone: "", password: "" });
  const [server, setServerState] = useState(getServer());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm({ ...form, [k]: v });

  const submit = async () => {
    setError("");
    if (!form.phone || !form.password || (mode === "register" && !form.name)) return setError("Remplissez tous les champs.");
    setBusy(true);
    try {
      await setServer(server);
      if (mode === "register") await register({ name: form.name.trim(), phone: form.phone.trim(), password: form.password });
      else await login(form.phone.trim(), form.password);
      router.replace("/accueil");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.night800 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: insets.top + 28, paddingHorizontal: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Logo size={40} />
            <T style={{ fontFamily: font.display, fontSize: 24, color: "#fff" }}>Gocelsys</T>
          </View>
          <T style={{ fontFamily: font.display, fontSize: 40, lineHeight: 42, color: "#fff", marginTop: 28, letterSpacing: -1.2 }}>Votre eau,{"\n"}livrée chez vous.</T>
          <T color={colors.onNightSoft} style={{ marginTop: 10, fontSize: 16 }}>Eau, boissons et produits du quotidien, depuis l'agence Gocelsys la plus proche.</T>
          <Svg width="100%" height="170" viewBox="0 0 320 170" style={{ marginTop: 18 }}>
            <Defs>
              <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.sky500} />
                <Stop offset="1" stopColor={colors.brand600} />
              </LinearGradient>
            </Defs>
            <Bottle x={10} h={70} fill={0.8} />
            <Bottle x={66} h={110} fill={0.6} />
            <Bottle x={122} h={140} fill={0.9} />
            <Bottle x={178} h={95} fill={0.45} />
            <Bottle x={234} h={125} fill={0.7} />
          </Svg>
        </View>
        <Svg viewBox="0 0 400 40" width="100%" height={40} preserveAspectRatio="none" style={{ marginTop: -6 }}>
          <Path d="M0 20 C 70 0, 130 40, 200 20 S 330 0, 400 20 V40 H0Z" fill={colors.bg} />
        </Svg>
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, gap: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: "row", backgroundColor: colors.line, borderRadius: 14, padding: 4 }}>
            {[["register", "Créer un compte"], ["login", "J'ai un compte"]].map(([m, l]) => (
              <Pressable key={m} onPress={() => setMode(m)} style={{ flex: 1, paddingVertical: 11, borderRadius: 11, backgroundColor: mode === m ? "#fff" : "transparent", alignItems: "center" }}>
                <T style={{ fontFamily: font.bold, color: mode === m ? colors.text : colors.soft }}>{l}</T>
              </Pressable>
            ))}
          </View>
          {mode === "register" && <Field label="Nom complet" value={form.name} onChangeText={set("name")} placeholder="Ex. Arlette Tamba" autoComplete="name" />}
          <Field label="Numéro de téléphone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="082 000 0000" autoComplete="tel" />
          <Field label="Mot de passe" value={form.password} onChangeText={set("password")} secureTextEntry placeholder="6 caractères minimum" onSubmitEditing={submit} />
          {error ? <Banner tone="clay" text={error} /> : null}
          <Button title={mode === "register" ? "Créer mon compte" : "Se connecter"} size="lg" loading={busy} onPress={submit} />
          <Pressable onPress={() => setShowServer((s) => !s)} style={{ alignSelf: "center", padding: 6 }}>
            <T variant="xs">Serveur : {server.replace(/^https?:\/\//, "")}</T>
          </Pressable>
          {showServer && <Field value={server} onChangeText={setServerState} autoCapitalize="none" keyboardType="url" />}
          <View style={{ borderRadius: radius.md, backgroundColor: colors.coral100, padding: 14 }}>
            <T style={{ fontFamily: font.semibold, color: "#9A2C14" }}>Bienvenue : −10 % sur votre première commande avec le code BIENVENUE.</T>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
