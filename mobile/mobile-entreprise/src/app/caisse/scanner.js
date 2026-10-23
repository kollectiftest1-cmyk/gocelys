import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, T } from "../../components/ui";
import { useCart } from "../../lib/cart";
import { kvGet } from "../../lib/db";
import { money } from "../../lib/format";
import { colors, font } from "../../lib/theme";

export default function Scanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const [permission, request] = useCameraPermissions();
  const [last, setLast] = useState(null);
  const lock = useRef(0);

  const onScan = ({ data }) => {
    const now = Date.now();
    if (now - lock.current < 1200) return;
    lock.current = now;
    const products = kvGet("catalog")?.products || [];
    for (const p of products) {
      const unit = p.units.find((u) => u.barcode === data) || (p.barcode === data ? p.units.find((u) => Number(u.factor) === 1) || p.units[0] : null);
      if (unit) {
        cart.add(p, unit);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setLast({ ok: true, text: `${p.name}${Number(unit.factor) > 1 ? ` — ${unit.unit_name}` : ""} · ${money(unit.current_price)}` });
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setLast({ ok: false, text: `Code inconnu : ${data}` });
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.night800, padding: 24, justifyContent: "center", gap: 16 }}>
        <T style={{ fontFamily: font.display, fontSize: 24, color: "#fff" }}>Autoriser la caméra</T>
        <T color={colors.onNightSoft}>La caméra sert à lire les codes-barres des produits.</T>
        <Button title="Autoriser" onPress={request} />
        <Button title="Annuler" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={onScan}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }} />
      <View style={{ position: "absolute", top: insets.top + 12, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T style={{ color: "#fff", fontFamily: font.display, fontSize: 20 }}>Scanner</T>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }} accessibilityLabel="Fermer">
          <X color="#fff" />
        </Pressable>
      </View>
      <View pointerEvents="none" style={{ position: "absolute", top: "35%", left: "12%", right: "12%", height: 150, borderWidth: 3, borderColor: colors.sky500, borderRadius: 20 }} />
      <View style={{ position: "absolute", bottom: insets.bottom + 20, left: 16, right: 16, gap: 10 }}>
        {last && (
          <View style={{ backgroundColor: last.ok ? colors.leaf500 : colors.clay500, padding: 14, borderRadius: 14 }}>
            <T style={{ color: "#fff", fontFamily: font.semibold }}>{last.ok ? "Ajouté : " : ""}{last.text}</T>
          </View>
        )}
        <Button title={`Terminer · ${cart.items} article${cart.items > 1 ? "s" : ""}`} onPress={() => router.back()} />
      </View>
    </View>
  );
}
