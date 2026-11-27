import { Redirect } from "expo-router";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { colors, spacing } from "@/theme";

export default function IndexScreen() {
  const { authReady, user } = useAuth();

  if (!authReady) {
    return (
      <View style={styles.container}>
        <Image
          source={require("../../assets/images/brand-mark.png")}
          style={styles.mark}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.text}>Opening AskSight…</Text>
      </View>
    );
  }

  return <Redirect href={user ? "/(tabs)/home" : "/login"} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    backgroundColor: colors.canvas,
  },
  mark: {
    width: 84,
    height: 84,
  },
  text: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
  },
});
