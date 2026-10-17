import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, Text, View } from "react-native";

// The backend has no OAuth provider (no googleId column, no auth router), so
// this stays non-interactive. It is rendered disabled with readable colours —
// not dimmed — and its accessible name says why, so nobody mistakes it for a
// working action.
export function GoogleButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel="Continue with Google — not available yet, use email and password"
      disabled
      className="touch-target flex-row items-center justify-center gap-3 rounded-field border-2 border-inputBorder bg-input px-6 py-4"
    >
      <MaterialCommunityIcons
        name="google"
        size={24}
        color="#000000"
        importantForAccessibility="no-hide-descendants"
      />
      <Text className="text-lg font-semibold text-ink">
        Continue with Google
      </Text>
      <View className="flex-row items-center gap-1">
        <MaterialCommunityIcons
          name="block-helper"
          size={18}
          color="#404040"
          importantForAccessibility="no-hide-descendants"
        />
        <Text className="text-base text-hint">Not yet available</Text>
      </View>
    </Pressable>
  );
}

export function OrDivider() {
  return (
    <View className="my-4 flex-row items-center gap-4">
      {/* Decorative lines are hidden; only the "or" text is announced. */}
      <View
        className="h-px flex-1 bg-inputBorder"
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        className="text-base font-medium text-muted"
        accessibilityLabel="Or"
      >
        or
      </Text>
      <View
        className="h-px flex-1 bg-inputBorder"
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}
