import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, Text, View } from "react-native";

// The backend has no OAuth provider (no googleId column, no auth router), so
// this renders for design fidelity only and stays non-interactive.
export function GoogleButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel="Continue with Google (not yet available)"
      className="flex-row items-center justify-center gap-3 rounded-field border border-field-border bg-field px-6 py-4 touch-target opacity-60"
    >
      <MaterialCommunityIcons name="google" size={22} color="#5C6168" importantForAccessibility="no-hide-descendants" />
      <Text className="text-base font-semibold text-ink">Continue with Google</Text>
    </Pressable>
  );
}

export function OrDivider() {
  return (
    <View className="flex-row items-center gap-4 my-4" role="separator" accessibilityLabel="Or">
      <View className="h-px flex-1 bg-field-border" importantForAccessibility="no-hide-descendants" />
      <Text className="text-sm font-medium text-muted">or</Text>
      <View className="h-px flex-1 bg-field-border" importantForAccessibility="no-hide-descendants" />
    </View>
  );
}