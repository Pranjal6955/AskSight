import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, View } from "react-native";

import { AppText } from "./AppText";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Go back",
}: Props) {
  return (
    <View className="mb-7">
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          className="mb-4 h-12 w-12 items-center justify-center rounded-full border-2 border-inputBorder bg-white"
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color="#000000"
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
      ) : null}
      <AppText variant="hero" accessibilityRole="header" className="text-ink">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="bodyLarge" className="mt-2 text-muted">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}
