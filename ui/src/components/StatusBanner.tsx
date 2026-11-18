import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { View } from "react-native";

import { AppText } from "./AppText";

type Tone = "error" | "success" | "info" | "warning";

type Props = {
  tone: Tone;
  message: string;
};

const TONES = {
  error: {
    icon: "alert-circle-outline",
    color: "#B42318",
    border: "border-error",
    text: "text-error",
  },
  success: {
    icon: "check-circle-outline",
    color: "#166534",
    border: "border-success",
    text: "text-success",
  },
  info: {
    icon: "information-outline",
    color: "#000000",
    border: "border-inputBorder",
    text: "text-ink",
  },
  warning: {
    icon: "alert-outline",
    color: "#000000",
    border: "border-brand",
    text: "text-ink",
  },
} as const;

export function StatusBanner({ tone, message }: Props) {
  const style = TONES[tone];

  return (
    <View
      accessible
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
      className={`flex-row items-start gap-3 rounded-field border-2 p-4 ${style.border} ${tone === "warning" ? "bg-warning" : "bg-white"}`}
    >
      <MaterialCommunityIcons
        name={style.icon}
        size={24}
        color={style.color}
        importantForAccessibility="no-hide-descendants"
      />
      <AppText
        variant="bodyLarge"
        style={{ fontWeight: "600" }}
        className={`flex-1 ${style.text}`}
      >
        {message}
      </AppText>
    </View>
  );
}
