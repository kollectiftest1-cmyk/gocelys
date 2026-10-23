import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, Button, Header, Screen, T } from "../../../components/ui";
import { api } from "../../../lib/api";
import { kvGet, kvSet } from "../../../lib/db";
import { num } from "../../../lib/format";
import { colors, font } from "../../../lib/theme";

export default function Count() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [inv, setInv] = useState(null);
  // Brouillon local : un comptage interrompu (coupure, batterie) n'est jamais perdu.
  const [counts, setCounts] = useState(() => kvGet(`inv.${id}`) || {});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/inventories/${id}/`).then((d) => {
      setInv(d);
      setCounts((c) => ({ ...Object.fromEntries(d.lines.filter((l) => l.counted !== null).map((l) => [l.id, String(Number(l.counted))])), ...c }));
    }).catch((e) => setMsg({ tone: "clay", text: e.message }));
  }, [id]);

  const setCount = (lineId, v) => {
    const next = { ...counts, [lineId]: v.replace(/[^\d.]/g, "") };
    setCounts(next);
    kvSet(`inv.${id}`, next);
  };

  const send = async (submit) => {
    setBusy(true);
    setMsg(null);
    try {
      let d = await api.post(`/inventories/${id}/count/`, { lines: inv.lines.map((l) => ({ id: l.id, counted: counts[l.id] ?? "" })) });
      if (submit) d = await api.post(`/inventories/${id}/submit/`, {});
      setInv(d);
      kvSet(`inv.${id}`, null);
      setMsg({ tone: "leaf", text: submit ? "Inventaire soumis : le responsable peut le valider." : "Comptage enregistré." });
      if (submit) setTimeout(() => router.back(), 900);
    } catch (e) {
      setMsg({ tone: "clay", text: e.offline ? "Pas de réseau : votre comptage reste enregistré sur l'appareil." : e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!inv) return <Screen><Header title="Inventaire" back />{msg && <Banner tone={msg.tone} text={msg.text} style={{ margin: 16 }} />}</Screen>;
  const editable = inv.status === "draft";
  const done = inv.lines.filter((l) => counts[l.id] !== undefined && counts[l.id] !== "").length;

  return (
    <Screen>
      <Header title={inv.reference} subtitle={`${inv.agency_name} · ${done}/${inv.lines.length} comptés`} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList data={inv.lines} keyExtractor={(l) => String(l.id)} contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled"
          ListHeaderComponent={msg ? <Banner tone={msg.tone} text={msg.text} style={{ marginBottom: 8 }} /> : null}
          renderItem={({ item: l }) => {
            const v = counts[l.id];
            const gap = v === undefined || v === "" ? null : Number(v) - Number(l.expected);
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.line }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: font.semibold }} numberOfLines={2}>{l.product_name}</T>
                  <T variant="xs">théorique {num(l.expected)} {l.unit.toLowerCase()}s{gap !== null && gap !== 0 ? ` · écart ${gap > 0 ? "+" : ""}${num(gap)}` : ""}</T>
                </View>
                <TextInput editable={editable} value={v ?? ""} onChangeText={(t) => setCount(l.id, t)} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.faint}
                  style={{ width: 92, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: gap ? (gap < 0 ? colors.clay500 : colors.amber500) : colors.lineStrong, textAlign: "center", fontFamily: font.display, fontSize: 20, color: colors.text, backgroundColor: editable ? "#fff" : colors.sunk }} />
              </View>
            );
          }} />
        {editable && (
          <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.line }}>
            <Button title="Enregistrer" variant="outline" onPress={() => send(false)} loading={busy} style={{ flex: 1 }} />
            <Button title="Soumettre" onPress={() => send(true)} disabled={busy || done < inv.lines.length} style={{ flex: 1 }} />
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
