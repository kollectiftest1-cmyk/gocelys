import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors, font, radius, tone as tones } from "../lib/theme";

export function T({ style, variant = "body", color, children, ...rest }) {
  const flat = StyleSheet.flatten([styles[variant], color && { color }, style]) || {};
  // Une taille de police surchargée sans interligne hériterait de celui du variant : on le recalcule.
  if (style && StyleSheet.flatten(style)?.fontSize && !StyleSheet.flatten(style)?.lineHeight) {
    flat.lineHeight = Math.round(flat.fontSize * 1.22);
  }
  return (
    <Text style={flat} {...rest}>
      {children}
    </Text>
  );
}

export function Logo({ size = 36, dark = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="18" fill={dark ? colors.night700 : colors.brand600} />
      <Path d="M43.5 22.4A15 15 0 1 0 47 32H33" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="47.5" cy="17.5" r="4.5" fill={colors.coral500} />
    </Svg>
  );
}

/** En-tête encre, commun à tous les modules. */
export function Header({ title, subtitle, back, right, children }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerRow}>
        {back && (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12} style={styles.backBtn} accessibilityLabel="Retour">
            <ArrowLeft color="#fff" size={22} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <T variant="h1" color="#fff" numberOfLines={1}>{title}</T>
          {subtitle ? <T variant="small" color={colors.onNightSoft} numberOfLines={1}>{subtitle}</T> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Screen({ children, style }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = "action", icon: Icon, disabled, loading, size = "md", style }) {
  const v = {
    action: { bg: colors.brand600, fg: "#fff", border: colors.brand600 },
    primary: { bg: colors.night800, fg: "#fff", border: colors.night800 },
    leaf: { bg: colors.leaf500, fg: "#fff", border: colors.leaf500 },
    ghost: { bg: "transparent", fg: colors.text, border: "transparent" },
    outline: { bg: colors.white, fg: colors.text, border: colors.lineStrong },
    danger: { bg: colors.white, fg: colors.clay600, border: colors.clay100 },
    night: { bg: colors.night800, fg: "#fff", border: colors.night800 },
  }[variant];
  const h = size === "lg" ? 56 : size === "sm" ? 36 : 48;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border, height: h, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}>
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {Icon && <Icon size={size === "sm" ? 16 : 19} color={v.fg} />}
          {title ? <T style={{ color: v.fg, fontFamily: font.bold, fontSize: size === "lg" ? 17 : size === "sm" ? 13 : 15 }}>{title}</T> : null}
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...input }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label && <T variant="label">{label}</T>}
      <TextInput placeholderTextColor={colors.faint} style={[styles.input, input.multiline && { height: 90, paddingTop: 12, textAlignVertical: "top" }]} {...input} />
      {error ? <T variant="small" color={colors.clay600}>{error}</T> : hint ? <T variant="small" color={colors.faint}>{hint}</T> : null}
    </View>
  );
}

export function Card({ children, style, onPress }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.sky50 }, style]}>
      {children}
    </Pressable>
  );
}

export function Pill({ label, tone = "neutral", style }) {
  const t = tones[tone] || tones.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <T style={{ color: t.fg, fontFamily: font.bold, fontSize: 12 }}>{label}</T>
    </View>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <View style={styles.empty}>
      {Icon && <Icon size={36} color={colors.sky500} />}
      <T variant="h3" style={{ textAlign: "center" }}>{title}</T>
      {text ? <T variant="body" color={colors.soft} style={{ textAlign: "center" }}>{text}</T> : null}
      {action}
    </View>
  );
}

export function Banner({ tone = "brand", icon: Icon, text, style }) {
  const t = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }, style]}>
      {Icon && <Icon size={18} color={t.fg} />}
      <T style={{ color: t.fg, flex: 1, fontFamily: font.medium }}>{text}</T>
    </View>
  );
}

export const styles = StyleSheet.create({
  body: { fontFamily: font.body, fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontFamily: font.body, fontSize: 13, color: colors.soft, lineHeight: 18 },
  xs: { fontFamily: font.medium, fontSize: 11.5, color: colors.faint },
  label: { fontFamily: font.semibold, fontSize: 13.5, color: colors.night700 },
  strong: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  h1: { fontFamily: font.display, fontSize: 22, color: colors.text, letterSpacing: -0.3 },
  h2: { fontFamily: font.display, fontSize: 19, color: colors.text, letterSpacing: -0.2 },
  h3: { fontFamily: font.displaySemi, fontSize: 16.5, color: colors.text },
  num: { fontFamily: font.display, fontSize: 18, color: colors.text, fontVariant: ["tabular-nums"] },
  big: { fontFamily: font.display, fontSize: 34, color: colors.text, letterSpacing: -0.8, fontVariant: ["tabular-nums"] },
  header: { backgroundColor: colors.night800, paddingHorizontal: 18, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.night700, alignItems: "center", justifyContent: "center" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16 },
  input: { height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.white, paddingHorizontal: 14, fontFamily: font.body, fontSize: 16, color: colors.text },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16 },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  empty: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md },
});
