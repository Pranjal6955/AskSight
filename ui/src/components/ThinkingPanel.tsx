import { ActivityIndicator, View } from "react-native";

import { AppText } from "@/components/AppText";
import { SecondaryButton } from "@/components/SecondaryButton";

type Props = { onCancel: () => void };

export function ThinkingPanel({ onCancel }: Props) {
  return (
    <View className="items-center gap-4 rounded-card border-2 border-inputBorder bg-white p-5">
      <ActivityIndicator
        accessibilityLabel="Looking at your photo"
        size="large"
        color="#000000"
      />
      <AppText
        variant="bodyLarge"
        accessibilityLiveRegion="polite"
        className="text-center font-semibold text-ink"
      >
        Looking at your photo…
      </AppText>
      <SecondaryButton label="Cancel" onPress={onCancel} />
    </View>
  );
}
