import { Redirect, useRouter } from "expo-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SyncBadge from "../../components/SyncBadge";
import { Banner, Button, Field, Header, Screen, T } from "../../components/ui";
import { money, num } from "../../lib/format";
import { closeSession, sessionSummary } from "../../lib/pos";
import { useSync } from "../../lib/sync";
import { colors, font } from "../../lib/theme";

const NOTES = [20000, 10000, 5000, 1000, 500, 200, 100, 50];

export default function Close() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { syncNow, refreshCounts } = useSync();
  const summary = useMemo(() => sessionSummary(), []);
  const [count, setCount] = useState({});
  const [justification, setJustification] = useState("");
  const [error, setError] = useState("");
  const counted = NOTES.reduce((s, n) => s + n * Number(count[n] || 0), 0);
  if (!summary) return <Redirect href="/caisse" />;
  const diff = counted - summary.expected_cash;

  const close = () => {
    if (diff !== 0 && !justification.trim()) return setError("Un écart a été constaté : expliquez-le avant de clôturer.");
    closeSession({ counted_cash: counted, count_detail: count, justification });
    refreshCounts();
    syncNow();
    router.replace("/caisse");
  };

  return (
    <Screen>
      <Header title="Clôturer la caisse" subtitle={`${summary.session.pos_name} · ${summary.count} vente(s)`} back right={<SyncBadge />} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[["Fonds initial", summary.session.opening_float], ["Ventes", summary.total], ["Espèces attendues", summary.expected_cash]].map(([l, v]) => (
              <View key={l} style={{ flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.line }}>
                <T variant="xs">{l}</T>
                <T style={{ fontFamily: font.display, fontSize: 16 }}>{money(v)}</T>
              </View>
            ))}
          </View>
          {summary.pending > 0 && <Banner tone="amber" text={`${summary.pending} vente(s) pas encore envoyée(s) : elles partiront avec la clôture.`} />}
          <T variant="h3">Comptage du tiroir</T>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.line }}>
            {NOTES.map((n, i) => (
              <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                <T style={{ fontFamily: font.bold, width: 80 }}>{num(n)} FC</T>
                <TextInput value={count[n] || ""} onChangeText={(t) => setCount({ ...count, [n]: t.replace(/\D/g, "") })} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.faint}
                  style={{ width: 80, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong, textAlign: "center", fontFamily: font.semibold, fontSize: 16 }} />
                <T color={colors.faint} style={{ marginLeft: "auto" }}>{money(n * Number(count[n] || 0))}</T>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <T style={{ fontFamily: font.semibold }}>Total compté</T>
            <T variant="big" style={{ fontSize: 28 }}>{money(counted)}</T>
          </View>
          <Banner tone={diff === 0 ? "leaf" : diff < 0 ? "clay" : "amber"} icon={diff === 0 ? CheckCircle2 : AlertTriangle}
            text={diff === 0 ? "Aucun écart avec le solde théorique." : `Écart de ${diff > 0 ? "+" : ""}${money(diff)} par rapport aux espèces attendues.`} />
          {diff !== 0 && <Field label="Justification" value={justification} onChangeText={setJustification} multiline placeholder="Erreur de rendu monnaie, billet refusé…" />}
          {error ? <Banner tone="clay" text={error} /> : null}
        </ScrollView>
        <View style={{ padding: 18, paddingBottom: insets.bottom + 14, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.line }}>
          <Button title="Clôturer la session" variant="night" size="lg" onPress={close} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
