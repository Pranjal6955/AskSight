import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "./AppText";

type Props = {
  title: string;
  description?: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
  disabled?: boolean;
};

export function ActionCard({
  title,
  description,
  icon,
  onPress,
  disabled = false,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`touch-target flex-row items-center gap-4 rounded-card border-2 border-inputBorder bg-white p-5 active:bg-card-grey ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <MaterialCommunityIcons
        name={icon}
        size={32}
        color="#000000"
        importantForAccessibility="no-hide-descendants"
      />
      <View className="flex-1">
        <AppText variant="section" className="text-ink">
          {title}
        </AppText>
        {description ? (
          <AppText variant="body" className="mt-1 text-muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={28}
        color="#404040"
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}
