import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, KeyRound, MapPin, Navigation, Phone, UserCheck } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, Button, Card, Field, Header, Pill, Screen, T } from "../../components/ui";
import { api, request } from "../../lib/api";
import { kvGet } from "../../lib/db";
import { money, num, time } from "../../lib/format";
import { colors, font, radius } from "../../lib/theme";
import { DSTATUS } from "../../lib/status";

const NEXT = {
  assigned: ["accepted", "Accepter la livraison"],
  accepted: ["picked_up", "J'ai récupéré le colis"],
  picked_up: ["en_route", "Je pars chez le client"],
};

async function position() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return {};
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) };
  } catch {
    return {};
  }
}

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [d, setD] = useState(() => (kvGet("deliveries") || []).find((x) => String(x.id) === String(id)));
  const [mode, setMode] = useState(null);
  const [otp, setOtp] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef(null);

  useEffect(() => {
    api.get(`/my/deliveries/${id}/`, { scope: "all" }).then(setD).catch(() => {});
  }, [id]);

  if (!d) return <Screen><Header title="Livraison" back /></Screen>;
  const [label, tone] = DSTATUS[d.status] || [d.status, "neutral"];
  const finished = ["delivered", "failed"].includes(d.status);

  const step = async (status, extra = {}) => {
    setBusy(true);
    setMsg(null);
    try {
      setD(await api.post(`/my/deliveries/${d.id}/status/`, { status, ...extra, ...(await position()) }));
    } catch (e) {
      setMsg({ tone: "clay", text: e.offline ? "Pas de réseau. Réessayez dans un instant." : e.message });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("method", mode);
      form.append("note", note);
      if (mode === "otp") form.append("otp", otp);
      if (mode === "photo" && photo) {
        form.append("photo", Platform.OS === "web" ? await (await fetch(photo.uri)).blob() : { uri: photo.uri, name: `preuve-${d.reference}.jpg`, type: "image/jpeg" });
      }
      const r = await request(`/my/deliveries/${d.id}/confirm/`, { method: "POST", form, timeout: 60000 });
      setD(r);
      setMode(null);
      setMsg({ tone: "leaf", text: "Livraison confirmée. Merci !" });
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      setMsg({ tone: "clay", text: e.offline ? "Pas de réseau : la confirmation n'est pas partie. Réessayez." : e.message });
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const p = await cam.current?.takePictureAsync({ quality: 0.5 });
    if (p) setPhoto(p);
  };

  const mapsUrl = d.latitude
    ? Platform.select({ ios: `maps:0,0?q=${d.latitude},${d.longitude}`, default: `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}` })
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address_text)}`;

  return (
    <Screen>
      <Header title={d.customer_name} subtitle={`${d.reference} · ${d.order_reference}`} back right={<Pill label={label} tone={tone} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {msg && <Banner tone={msg.tone} text={msg.text} />}
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <MapPin size={18} color={colors.brand600} />
            <T style={{ flex: 1, fontFamily: font.semibold }}>{d.address_text}</T>
          </View>
          {d.zone_name && <T variant="xs">Zone {d.zone_name}</T>}
          {d.note ? <Banner tone="brand" text={d.note} /> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button title="Appeler" icon={Phone} variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${d.customer_phone}`)} />
            <Button title="Itinéraire" icon={Navigation} variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(mapsUrl)} />
          </View>
        </Card>
        <Card style={{ gap: 8 }}>
          <T variant="h3">À livrer</T>
          {d.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T style={{ flex: 1 }}>{l.label}</T>
              <T style={{ fontFamily: font.bold }}>× {num(l.quantity)}</T>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <T color={colors.soft}>{d.payment_status === "paid" ? "Déjà payée" : `À encaisser (${d.payment_method_name || "espèces"})`}</T>
            <T variant="big" style={{ fontSize: 26, color: d.payment_status === "paid" ? colors.leaf600 : colors.text }}>{money(d.total)}</T>
          </View>
        </Card>
        {d.assigned_at && <T variant="xs">Affectée à {time(d.assigned_at)}{d.departed_at ? ` · départ ${time(d.departed_at)}` : ""}{d.arrived_at ? ` · livrée ${time(d.arrived_at)}` : ""}</T>}

        {mode && (
          <Card style={{ gap: 12, borderColor: colors.coral500, borderWidth: 1.5 }}>
            <T variant="h3">Preuve de livraison</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[["otp", "Code client", KeyRound], ["photo", "Photo", Camera], ["driver", "Sans code", UserCheck]].map(([m, l, Icon]) => (
                <Pressable key={m} onPress={() => setMode(m)} style={{ flex: 1, alignItems: "center", gap: 6, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: mode === m ? colors.brand600 : colors.lineStrong, backgroundColor: mode === m ? colors.brand50 : "#fff" }}>
                  <Icon size={20} color={mode === m ? colors.brand600 : colors.faint} />
                  <T style={{ fontFamily: font.semibold, fontSize: 13 }}>{l}</T>
                </Pressable>
              ))}
            </View>
            {mode === "otp" && (
              <>
                <T variant="small">Demandez au client le code à 4 chiffres reçu dans son application ou par SMS.</T>
                <TextInput value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="0000" placeholderTextColor={colors.lineStrong}
                  style={{ height: 70, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lineStrong, textAlign: "center", fontFamily: font.display, fontSize: 36, letterSpacing: 14, color: colors.text, backgroundColor: "#fff" }} />
              </>
            )}
            {mode === "photo" && (
              perm?.granted ? (
                photo ? (
                  <View style={{ gap: 8 }}>
                    <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 220, borderRadius: 14 }} />
                    <Button title="Reprendre la photo" variant="outline" size="sm" onPress={() => setPhoto(null)} />
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    <CameraView ref={cam} style={{ height: 260, borderRadius: 14, overflow: "hidden" }} facing="back" />
                    <Button title="Prendre la photo" icon={Camera} variant="night" onPress={takePhoto} />
                  </View>
                )
              ) : <Button title="Autoriser la caméra" variant="outline" onPress={requestPerm} />
            )}
            {mode === "driver" && <T variant="small">À utiliser si le client n'a pas son code : l'agence verra que la livraison a été confirmée par vous.</T>}
            <Field label="Commentaire (facultatif)" value={note} onChangeText={setNote} placeholder="Remis au gardien, client absent…" />
            <Button title="Confirmer la livraison" variant="leaf" size="lg" loading={busy}
              disabled={(mode === "otp" && otp.length < 4) || (mode === "photo" && !photo)} onPress={confirm} />
            <Button title="Signaler un échec" variant="danger" size="sm" onPress={() => note ? step("failed", { note }) : setMsg({ tone: "amber", text: "Indiquez la raison de l'échec dans le commentaire." })} />
          </Card>
        )}
      </ScrollView>
      {!finished && !mode && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.line, gap: 8 }}>
          {NEXT[d.status] ? (
            <Button title={NEXT[d.status][1]} size="lg" loading={busy} onPress={() => step(NEXT[d.status][0])} />
          ) : null}
          {["accepted", "picked_up", "en_route"].includes(d.status) && (
            <Button title="Je suis chez le client" variant={NEXT[d.status] ? "outline" : "leaf"} size={NEXT[d.status] ? "md" : "lg"} onPress={() => setMode("otp")} />
          )}
        </View>
      )}
    </Screen>
  );
}
