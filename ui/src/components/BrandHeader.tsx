import { Image, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme";

export function BrandHeader() {
  return (
    <View style={styles.row} accessible accessibilityLabel="AskSight">
      <Image
        source={require("../../assets/images/brand-mark.png")}
        style={styles.mark}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <View>
        <Text style={styles.wordmark}>AskSight</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  mark: {
    width: 44,
    height: 44,
  },
  wordmark: {
    color: colors.ink,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
});
