import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, View } from "react-native";

import { AppText } from "./AppText";

export type MicButtonState = "idle" | "listening" | "processing";

type Props = {
  state: MicButtonState;
  onPress: () => void;
};

const COPY: Record<
  MicButtonState,
  { label: string; icon: "microphone" | "stop" | "loading" }
> = {
  idle: { label: "Tap to speak", icon: "microphone" },
  listening: { label: "Tap to stop", icon: "stop" },
  processing: { label: "Processing", icon: "loading" },
};

export function MicButton({ state, onPress }: Props) {
  const copy = COPY[state];
  const busy = state === "processing";

  return (
    <View className="items-center gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.label}
        accessibilityState={{
          selected: state === "listening",
          disabled: busy,
          busy,
        }}
        disabled={busy}
        onPress={onPress}
        className={`h-[132px] w-[132px] items-center justify-center rounded-full border-4 border-brand ${state === "listening" ? "bg-warning" : "bg-brand"}`}
      >
        <MaterialCommunityIcons
          name={copy.icon}
          size={54}
          color={state === "listening" ? "#000000" : "#FFFFFF"}
          importantForAccessibility="no-hide-descendants"
        />
      </Pressable>
      <AppText variant="bodyLarge" className="font-semibold text-ink">
        {copy.label}
      </AppText>
    </View>
  );
}
