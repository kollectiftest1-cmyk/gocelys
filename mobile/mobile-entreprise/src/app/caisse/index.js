import { useFocusEffect, useRouter } from "expo-router";
import { History, Lock, ScanLine, Search, ShoppingBasket, WalletCards } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SyncBadge from "../../components/SyncBadge";
import { Banner, Button, Empty, Field, Header, Screen, T } from "../../components/ui";
import { workAgency } from "../../lib/agency";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { kvGet } from "../../lib/db";
import { money, num } from "../../lib/format";
import { currentSession, openSession } from "../../lib/pos";
import { pullReference, useSync } from "../../lib/sync";
import { colors, font, radius } from "../../lib/theme";
import CartPanel from "../../modules/CartPanel";

function OpenSession({ catalog, onOpened, refreshing, onRefresh }) {
  const { user, can } = useAuth();
  const mine = user?.assigned_pos;
  const manager = can("cash.validate");
  const [pos, setPos] = useState(mine || null);
  const [float, setFloat] = useState(String(Math.round(Number((mine || {}).default_float || 0))));
  const list = catalog?.points_of_sale || [];
  const choose = (p) => {
    setPos(p);
    setFloat(String(Math.round(Number(p.default_float || 0))));
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
        <WalletCards size={40} color={colors.brand500} />
        <T variant="h1">Ouvrir la caisse</T>
        <T color={colors.soft} style={{ textAlign: "center" }}>Comptez la monnaie du tiroir avant la première vente : c'est votre fonds de caisse.</T>
      </View>
      {!catalog ? (
        <Banner tone="amber" text="Le catalogue n'est pas encore sur cet appareil. Connectez-vous au réseau une première fois pour le télécharger." />
      ) : mine ? (
        <View style={{ backgroundColor: colors.brand50, borderColor: colors.brand100, borderWidth: 1, borderRadius: radius.lg, padding: 16 }}>
          <T variant="xs">Votre caisse</T>
          <T style={{ fontFamily: font.display, fontSize: 24, color: colors.brand700 }}>{mine.name}</T>
          <T variant="small">{mine.agency_name}</T>
        </View>
      ) : manager ? (
        <>
          <T variant="label">Caisse à ouvrir (remplacement)</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {list.map((p) => (
              <Pressable key={p.id} onPress={() => choose(p)}
                style={{ paddingHorizontal: 18, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: pos?.id === p.id ? colors.brand600 : colors.lineStrong, backgroundColor: pos?.id === p.id ? colors.brand50 : "#fff" }}>
                <T style={{ fontFamily: font.bold, color: pos?.id === p.id ? colors.brand700 : colors.text }}>{p.name}</T>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Banner tone="amber" text="Vous n'êtes affecté à aucune caisse. Demandez à votre responsable de vous en attribuer une." />
      )}
      {catalog && pos && (
        <>
          <Field label="Fonds de caisse (FC)" value={float} onChangeText={setFloat} keyboardType="number-pad"
            hint="Montant proposé par l'agence. Corrigez-le si votre comptage est différent." />
          <Button title="Ouvrir la caisse" size="lg" onPress={() => onOpened(openSession({ pos, opening_float: float, user }))} />
        </>
      )}
      <Button title="Mettre à jour le catalogue" variant="outline" loading={refreshing} onPress={onRefresh} />
    </ScrollView>
  );
}

export default function Pos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { online, syncNow } = useSync();
  const cart = useCart();
  const [catalog, setCatalog] = useState(() => kvGet("catalog"));
  const [session, setSession] = useState(() => currentSession());
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const wide = width >= 820;
  const agencyId = user?.assigned_pos?.agency || workAgency(user)?.id;

  const refresh = useCallback(async () => {
    if (!agencyId) return;
    setRefreshing(true);
    try {
      await syncNow();
      await pullReference(agencyId);
      setCatalog(kvGet("catalog"));
      setError("");
    } catch (e) {
      setError(e.offline ? "" : e.message);
    } finally {
      setRefreshing(false);
    }
  }, [agencyId, syncNow]);

  useFocusEffect(
    useCallback(() => {
      setSession(currentSession());
      setCatalog(kvGet("catalog"));
      if (online) refresh();
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const products = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (catalog?.products || []).filter((p) => (!cat || p.category === cat) && (!s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)));
  }, [catalog, cat, q]);

  if (!session) {
    return (
      <Screen>
        <Header title="Caisse" subtitle={user?.assigned_pos?.agency_name || workAgency(user)?.name} back right={<SyncBadge />} />
        <OpenSession catalog={catalog} refreshing={refreshing} onRefresh={refresh} onOpened={(s) => { setSession(s); syncNow(); }} />
      </Screen>
    );
  }

  const cols = wide ? Math.max(3, Math.floor((width - 380) / 190)) : width > 560 ? 3 : 2;
  const stock = catalog?.stock || {};

  return (
    <Screen>
      <Header title={session.pos_name} subtitle={`Ouverte à ${new Date(session.opened_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${user?.full_name}`} back
        right={
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <SyncBadge />
            <Pressable onPress={() => router.push("/caisse/ventes")} hitSlop={8} accessibilityLabel="Ventes de la session"><History color="#fff" size={22} /></Pressable>
            <Pressable onPress={() => router.push("/caisse/cloture")} hitSlop={8} accessibilityLabel="Clôturer la caisse"><Lock color="#fff" size={21} /></Pressable>
          </View>
        }>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.night700, borderRadius: 12, paddingHorizontal: 12 }}>
            <Search size={18} color={colors.onNightSoft} />
            <TextInput value={q} onChangeText={setQ} placeholder="Chercher un produit" placeholderTextColor={colors.onNightSoft}
              style={{ flex: 1, height: 44, color: "#fff", fontFamily: font.body, fontSize: 15, marginLeft: 8 }} />
          </View>
          <Pressable onPress={() => router.push("/caisse/scanner")} accessibilityLabel="Scanner un code-barres"
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.sky500, alignItems: "center", justifyContent: "center" }}>
            <ScanLine color={colors.night900} size={22} />
          </Pressable>
        </View>
      </Header>

      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, height: 60 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, alignItems: "center" }}>
            {[{ id: null, name: "Tout" }, ...(catalog?.categories || [])].map((c) => (
              <Pressable key={c.id ?? "all"} onPress={() => setCat(c.id)}
                style={{ paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: 999, backgroundColor: cat === c.id ? colors.night800 : "#fff", borderWidth: 1, borderColor: cat === c.id ? colors.night800 : colors.lineStrong }}>
                <T style={{ fontFamily: font.semibold, fontSize: 13.5, color: cat === c.id ? "#fff" : colors.text }}>{c.name}</T>
              </Pressable>
            ))}
          </ScrollView>
          {error ? <Banner tone="clay" text={error} style={{ marginHorizontal: 12 }} /> : null}
          <FlatList
            key={cols}
            data={products}
            numColumns={cols}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: wide ? 20 : 110 }}
            ListEmptyComponent={<Empty icon={Search} title="Aucun produit" text="Modifiez la recherche ou mettez à jour le catalogue." />}
            renderItem={({ item: p }) => {
              const s = stock[p.id] ?? 0;
              const packs = p.units.filter((u) => Number(u.factor) > 1);
              return (
                <View style={{ flex: 1 / cols, padding: 4 }}>
                  <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: "hidden", opacity: s <= 0 ? 0.6 : 1 }}>
                    <Pressable onPress={() => cart.add(p)} style={({ pressed }) => ({ padding: 12, gap: 4, backgroundColor: pressed ? colors.sky50 : "#fff" })}>
                      <View style={{ width: 28, height: 5, borderRadius: 3, backgroundColor: p.accent || colors.sky500, marginBottom: 4 }} />
                      <T style={{ fontFamily: font.semibold, fontSize: 14, minHeight: 38 }} numberOfLines={2}>{p.name}</T>
                      <T variant="num">{money(p.current_price)}</T>
                      <T variant="xs" color={s <= Number(p.min_stock) ? colors.clay600 : colors.faint}>{s <= 0 ? "Rupture" : `${num(s)} en stock`}</T>
                    </Pressable>
                    {packs.length > 0 && (
                      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.line }}>
                        {packs.map((u, i) => (
                          <Pressable key={u.id} onPress={() => cart.add(p, u)}
                            style={({ pressed }) => ({ flex: 1, paddingVertical: 9, alignItems: "center", backgroundColor: pressed ? colors.brand100 : colors.sunk, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.line })}>
                            <T style={{ fontFamily: font.bold, fontSize: 12, color: colors.brand600 }}>{u.unit_name} ×{num(u.factor)}</T>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </View>
        {wide && (
          <View style={{ width: 380, borderLeftWidth: 1, borderLeftColor: colors.line, backgroundColor: "#fff" }}>
            <CartPanel onCheckout={() => router.push("/caisse/encaisser")} />
          </View>
        )}
      </View>

      {!wide && cart.items > 0 && (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 12 }}>
          <Pressable onPress={() => router.push("/caisse/encaisser")}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.brand600, borderRadius: 18, padding: 16, transform: [{ scale: pressed ? 0.98 : 1 }], shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 })}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}>
              <ShoppingBasket color="#FFFFFF" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: font.bold, color: "#FFFFFF" }}>{num(cart.items)} article{cart.items > 1 ? "s" : ""}</T>
              <T variant="xs" color="rgba(255,255,255,0.82)">Toucher pour encaisser</T>
            </View>
            <T style={{ fontFamily: font.display, fontSize: 22, color: "#FFFFFF" }}>{money(cart.subtotal)}</T>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
