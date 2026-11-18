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
  variant?: "default" | "hero";
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function ActionCard({
  title,
  description,
  icon,
  onPress,
  disabled = false,
  variant = "default",
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const hero = variant === "hero";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (description ? `${title}. ${description}` : title)
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`${
        hero
          ? `min-h-[255px] items-center justify-center rounded-[30px] px-6 py-7 ${disabled ? "bg-brand-muted" : "bg-brand active:bg-brand-deep"}`
          : `touch-target flex-row items-center gap-4 rounded-card border-2 border-inputBorder p-5 ${disabled ? "bg-field" : "bg-white active:bg-card-grey"}`
      }`}
    >
      {hero ? (
        <>
          <View
            className="mb-4 h-[82px] w-[104px] items-center justify-center rounded-[24px] bg-white"
            importantForAccessibility="no-hide-descendants"
          >
            <MaterialCommunityIcons
              name={icon}
              size={55}
              color="#000000"
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <AppText variant="title" className="text-center text-white">
            {title}
          </AppText>
          {description ? (
            <AppText
              variant="bodyLarge"
              className="mt-2 max-w-[330px] text-center text-white"
            >
              {description}
            </AppText>
          ) : null}
        </>
      ) : (
        <>
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
        </>
      )}
    </Pressable>
  );
}
