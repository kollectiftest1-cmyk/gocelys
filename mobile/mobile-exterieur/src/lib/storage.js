import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export async function getJSON(key, fallback = null) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function setJSON(key, value) {
  try {
    if (value === null || value === undefined) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

/** Secrets (jetons) : trousseau sécurisé sur mobile, stockage local sur le web. */
export async function getSecret(key) {
  if (Platform.OS === "web") return getJSON(key);
  const raw = await SecureStore.getItemAsync(key);
  return raw ? JSON.parse(raw) : null;
}

export async function setSecret(key, value) {
  if (Platform.OS === "web") return setJSON(key, value);
  if (value) await SecureStore.setItemAsync(key, JSON.stringify(value));
  else await SecureStore.deleteItemAsync(key);
}
