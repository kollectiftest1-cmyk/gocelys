import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Banner, Button, Field, Header, Screen, T } from "../../components/ui";
import { workAgency } from "../../lib/agency";
import { request } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { kvGet } from "../../lib/db";
import { num } from "../../lib/format";
import { colors, font, radius } from "../../lib/theme";

export default function Loss() {
  const router = useRouter();
  const { user } = useAuth();
  const agency = workAgency(user);
  const levels = useMemo(() => kvGet(`levels.${agency?.id}`)?.results || [], [agency?.id]);
  const [type, setType] = useState("damage");
  const [product, setProduct] = useState(null);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setMsg(null);
    if (!product || !Number(qty) || !reason.trim()) return setMsg({ tone: "clay", text: "Produit, quantité et motif sont obligatoires." });
    setBusy(true);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("agency", String(agency.id));
      form.append("product", String(product.product));
      form.append("quantity", qty);
      form.append("reason", reason);
      const r = await request("/stock/operations/", { method: "POST", form });
      setMsg({ tone: "leaf", text: `Enregistré. Disponible : ${num(r.available)}.` });
      setQty("");
      setReason("");
      setTimeout(() => router.back(), 900);
    } catch (e) {
      setMsg({ tone: "clay", text: e.offline ? "Pas de réseau : la déclaration doit être envoyée en ligne. Réessayez dès le retour de la connexion." : e.message });
    } finally {
      setBusy(false);
    }
  };

  const filtered = levels.filter((r) => !q || r.product_name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  return (
    <Screen>
      <Header title="Perte ou casse" subtitle={agency?.name} back />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[["damage", "Produit abîmé"], ["loss", "Produit perdu"]].map(([v, l]) => (
            <Pressable key={v} onPress={() => setType(v)} style={{ flex: 1, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: type === v ? colors.brand600 : colors.lineStrong, backgroundColor: type === v ? colors.brand50 : "#fff" }}>
              <T style={{ fontFamily: font.bold, color: type === v ? colors.brand700 : colors.text, textAlign: "center" }}>{l}</T>
            </Pressable>
          ))}
        </View>
        {product ? (
          <Pressable onPress={() => setProduct(null)} style={{ backgroundColor: colors.brand50, borderRadius: 14, padding: 14 }}>
            <T style={{ fontFamily: font.bold }}>{product.product_name}</T>
            <T variant="xs">Disponible : {num(product.available)} {product.unit.toLowerCase()}s · toucher pour changer</T>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            <Field label="Produit" value={q} onChangeText={setQ} placeholder="Chercher…" />
            {filtered.map((r) => (
              <Pressable key={r.product} onPress={() => setProduct(r)} style={{ padding: 12, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.line }}>
                <T>{r.product_name}</T>
              </Pressable>
            ))}
          </View>
        )}
        <Field label={`Quantité${product ? ` (en ${product.unit.toLowerCase()}s)` : ""}`} value={qty} onChangeText={setQty} keyboardType="number-pad" />
        <Field label="Motif" value={reason} onChangeText={setReason} multiline placeholder="Pack percé au déchargement" />
        {msg && <Banner tone={msg.tone} text={msg.text} />}
        <Button title="Enregistrer la déclaration" onPress={submit} loading={busy} size="lg" />
      </ScrollView>
    </Screen>
  );
}
