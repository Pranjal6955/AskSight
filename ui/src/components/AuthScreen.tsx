import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandHeader } from "@/components/BrandHeader";
import { colors, spacing } from "@/theme";

type Props = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthScreen({ title, children, footer }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View pointerEvents="none" style={styles.decorTop} />
      <View pointerEvents="none" style={styles.decorBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <BrandHeader />

            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {children}

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  content: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "800",
    letterSpacing: -1,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  footer: {
    marginTop: spacing.xxl,
  },
  decorTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.accentSoft,
    opacity: 0.55,
    top: -110,
    right: -90,
  },
  decorBottom: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.surfaceMuted,
    bottom: -120,
    left: -80,
  },
});
