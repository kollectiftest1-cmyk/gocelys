import { useRouter } from "expo-router";
import { CloudOff, LogOut, RefreshCw, Server } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Banner, Button, Card, Field, Header, Screen, T } from "../components/ui";
import { setWorkAgency, workAgency } from "../lib/agency";
import { getServer, setServer } from "../lib/api";
import { useAuth } from "../lib/auth";
import { rejectedOps } from "../lib/db";
import { ago } from "../lib/format";
import { currentSession } from "../lib/pos";
import { deviceId, useSync } from "../lib/sync";
import { colors, font, radius } from "../lib/theme";

const TYPE = { "sale.create": "Vente", "session.open": "Ouverture de caisse", "session.close": "Clôture de caisse", "cash.movement": "Mouvement de caisse" };

export default function Account() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { online, pending, rejected, syncing, lastSync, lastError, syncNow } = useSync();
  const [server, setServerState] = useState(getServer());
  const [agency, setAgency] = useState(workAgency(user));
  const failures = rejectedOps();
  const open = currentSession();

  const doLogout = async () => {
    if (pending > 0 || open) return;
    await logout();
    router.replace("/connexion");
  };

  return (
    <Screen>
      <Header title="Mon compte" subtitle={user?.full_name} back />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T variant="h3">Synchronisation</T>
            {!online && <CloudOff size={18} color={colors.coral600} />}
          </View>
          <T>{online ? "Connecté au serveur" : "Hors ligne : les ventes restent sur l'appareil"}</T>
          <T variant="small">{pending} opération(s) en attente · dernier envoi {lastSync ? ago(lastSync) : "jamais"}</T>
          {lastError && !online ? null : lastError ? <Banner tone="amber" text={lastError} /> : null}
          <Button title="Synchroniser maintenant" icon={RefreshCw} variant="outline" loading={syncing} onPress={syncNow} />
          <T variant="xs">Appareil {deviceId()}</T>
        </Card>
        {rejected > 0 && (
          <Card style={{ gap: 8, borderColor: colors.clay100 }}>
            <T variant="h3" color={colors.clay600}>Opérations refusées par le serveur</T>
            <T variant="small">Montrez cette liste à votre responsable : elles doivent être corrigées depuis l'espace web.</T>
            {failures.map((f) => (
              <View key={f.op_id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                <T style={{ fontFamily: font.semibold }}>{TYPE[f.type] || f.type} · {new Date(f.occurred_at).toLocaleString("fr-FR")}</T>
                <T variant="small" color={colors.clay600}>{f.error}</T>
              </View>
            ))}
          </Card>
        )}
        {user?.agencies?.length > 1 && (
          <Card style={{ gap: 10 }}>
            <T variant="h3">Agence de travail</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {user.agencies.map((a) => (
                <Pressable key={a.id} onPress={() => { setWorkAgency(a.id); setAgency(a); }}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: agency?.id === a.id ? colors.brand600 : colors.lineStrong, backgroundColor: agency?.id === a.id ? colors.brand50 : "#fff" }}>
                  <T style={{ fontFamily: font.semibold }}>{a.name}</T>
                </Pressable>
              ))}
            </View>
          </Card>
        )}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Server size={18} color={colors.soft} /><T variant="h3">Serveur</T></View>
          <Field value={server} onChangeText={setServerState} autoCapitalize="none" keyboardType="url" />
          <Button title="Enregistrer l'adresse" variant="outline" size="sm" onPress={() => setServer(server)} />
        </Card>
        {(pending > 0 || open) && <Banner tone="amber" text={open ? "Clôturez la caisse avant de vous déconnecter." : "Des opérations ne sont pas encore envoyées : reconnectez-vous au réseau avant de vous déconnecter."} />}
        <Button title="Se déconnecter" icon={LogOut} variant="danger" onPress={doLogout} disabled={pending > 0 || Boolean(open)} />
      </ScrollView>
    </Screen>
  );
}
