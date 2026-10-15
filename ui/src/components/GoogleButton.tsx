import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text, View } from "react-native";

// The backend has no OAuth provider (no googleId column, no auth router), so
// this renders for design fidelity only and stays non-interactive.
export function GoogleButton() {
  return (
    <View
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel="Continue with Google (coming soon)"
      className="flex-row items-center justify-center gap-3 rounded-field border border-muted/20 bg-white/60 py-4 opacity-50"
    >
      <MaterialCommunityIcons name="google" size={22} color="#3C424D" />
      <Text className="text-base font-semibold text-ink">
        Continue with Google
      </Text>
    </View>
  );
}

export function OrDivider() {
  return (
    <View className="flex-row items-center gap-4">
      <View className="h-px flex-1 bg-muted/20" />
      <Text className="text-sm text-muted">or</Text>
      <View className="h-px flex-1 bg-muted/20" />
    </View>
  );
}
