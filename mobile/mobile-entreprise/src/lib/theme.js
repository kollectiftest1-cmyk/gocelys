/** Système visuel « Indigo » — partagé avec le web Gocelsys. */
export const colors = {
  night900: "#0B0A24",
  night800: "#14123A",
  night700: "#1F1C55",
  night600: "#2C2873",
  brand700: "#3A26C4",
  brand600: "#4B35E0",
  brand500: "#6450FF",
  brand300: "#A99DFF",
  brand100: "#E8E4FF",
  brand50: "#F4F2FF",
  sky600: "#0B9CC4",
  sky500: "#22C3E6",
  sky300: "#8BE1F2",
  sky100: "#D6F4FB",
  sky50: "#EEFBFE",
  coral600: "#D9432A",
  coral500: "#F25A3C",
  coral100: "#FFE3DC",
  leaf600: "#0E8A4F",
  leaf500: "#16B36A",
  leaf100: "#D5F5E5",
  clay600: "#C9363E",
  clay500: "#E5484D",
  clay100: "#FDE2E3",
  amber600: "#A86A00",
  amber500: "#F2A01F",
  amber100: "#FFF0D1",
  white: "#FFFFFF",
  bg: "#F5F5FA",
  sunk: "#FBFBFE",
  line: "#ECECF4",
  lineStrong: "#DCDCE8",
  text: "#14123A",
  soft: "#545470",
  faint: "#6E6E86",
  onNight: "#CFCDEB",
  onNightSoft: "#A9A7D6",
};

export const font = {
  display: "PlusJakartaSans_800ExtraBold",
  displaySemi: "PlusJakartaSans_700Bold",
  body: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = (n) => n * 4;

export const tone = {
  brand: { bg: colors.brand100, fg: colors.brand700 },
  sky: { bg: colors.sky100, fg: "#06627C" },
  coral: { bg: colors.coral100, fg: "#9A2C14" },
  leaf: { bg: colors.leaf100, fg: "#0B5E37" },
  clay: { bg: colors.clay100, fg: "#8E1F26" },
  amber: { bg: colors.amber100, fg: "#6E4600" },
  night: { bg: colors.night800, fg: "#FFFFFF" },
  neutral: { bg: colors.line, fg: "#3B3B55" },
};
