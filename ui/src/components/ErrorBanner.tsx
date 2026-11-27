import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/theme";

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.banner}
    >
      <Ionicons name="alert-circle" size={20} color={colors.error} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E9B7B1",
    backgroundColor: colors.errorSoft,
  },
  text: {
    flex: 1,
    color: colors.error,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
});
