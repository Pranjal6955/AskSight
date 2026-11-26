import { Platform } from "react-native";

export const colors = {
  canvas: "#F6F1E6",
  surface: "#FFFDF8",
  surfaceMuted: "#EFE9DB",
  ink: "#1C2416",
  muted: "#5B6353",
  primary: "#2F4A1F",
  primaryPressed: "#233816",
  accent: "#D98E2B",
  accentSoft: "#F7E6C9",
  border: "#DDD5C4",
  error: "#B42318",
  errorSoft: "#FBE9E7",
  success: "#166534",
  white: "#FFFFFF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 28,
  pill: 999,
} as const;

export const cardShadow = Platform.select({
  ios: {
    shadowColor: "#3B3328",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  android: { elevation: 4 },
  default: {
    boxShadow: "0 10px 24px rgba(59, 51, 40, 0.08)",
  },
});

export const tabBarSpace = 92;
