import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ComponentProps } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import {
  cardShadow,
  colors,
  radius,
  spacing,
  tabBarSpace,
} from "@/theme";

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function memberSince(createdAt?: string): string {
  if (!createdAt) return "AskSight member";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "AskSight member";
  return `Member since ${date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })}`;
}

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const initial = (user?.name?.trim()[0] ?? "A").toUpperCase();

  function handleSignOut() {
    signOut();
    router.replace("/login");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: tabBarSpace + insets.bottom + spacing.xxl },
        ]}
      >
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>
            Account
          </Text>
          <Text style={styles.subtitle}>
            Your profile and AskSight preferences.
          </Text>

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>

            <View style={styles.profileCopy}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.name ?? "AskSight user"}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {user?.email ?? "Signed in"}
              </Text>
              <View style={styles.memberBadge}>
                <Text style={styles.memberText}>
                  {memberSince(user?.createdAt)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <InfoRow
              icon="volume-high-outline"
              label="Reading & listening"
              value="Voice and on-screen text"
            />
            <View style={styles.divider} />
            <InfoRow
              icon="language-outline"
              label="Language"
              value="English (India)"
            />
            <View style={styles.divider} />
            <InfoRow
              icon="shield-checkmark-outline"
              label="Privacy & data"
              value="Your history is private"
            />
          </View>

          <Text style={styles.comingSoon}>
            More account settings are coming soon.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOut,
              pressed && styles.signOutPressed,
            ]}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          <Text style={styles.version}>AskSight · 0.1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    overflow: "hidden",
    ...cardShadow,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  email: {
    color: "#DCE6D0",
    fontSize: 14,
    lineHeight: 19,
  },
  memberBadge: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  memberText: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  infoCard: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: {
    flex: 1,
    gap: 1,
  },
  infoLabel: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  infoValue: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 52,
  },
  comingSoon: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 54,
    marginTop: spacing.xxl,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "#E9B7B1",
    backgroundColor: colors.errorSoft,
  },
  signOutPressed: {
    opacity: 0.75,
  },
  signOutText: {
    color: colors.error,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  version: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
