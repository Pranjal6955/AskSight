import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { HistoryItem } from "@/lib/api";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  cardShadow,
  colors,
  radius,
  spacing,
  tabBarSpace,
} from "@/theme";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { withAuth } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(null);
      void withAuth((token) => api.history(token))
        .then((page) => {
          if (active) {
            setItems(page.items);
            setNextCursor(page.next_cursor);
            setHasMore(page.has_more);
          }
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not load your history.",
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [withAuth]),
  );

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await withAuth((token) =>
        api.history(token, 20, nextCursor),
      );
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more history.",
      );
    } finally {
      setLoadingMore(false);
    }
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
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                History
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {items.length}{hasMore ? "+" : ""} saved
              </Text>
            </View>
          </View>

          {loading ? (
            <View accessibilityLiveRegion="polite" style={styles.loading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading history</Text>
            </View>
          ) : error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : items.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.iconCircle}>
                <Ionicons name="time-outline" size={38} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No questions yet</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask your first question"
                onPress={() => router.push("/(tabs)/home")}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Ask something</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              {items.map((item) => (
                <View key={item.id} style={styles.entry}>
                  {item.model_version === "mock-0.0.0" ? (
                    <Text style={styles.demoLabel}>Demo answer</Text>
                  ) : null}
                  <Text style={styles.question}>{item.question}</Text>
                  <Text style={styles.answer}>{item.answer}</Text>
                  <Text style={styles.date}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))}
              {hasMore ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Load more history"
                  accessibilityState={{ busy: loadingMore }}
                  disabled={loadingMore}
                  onPress={loadMore}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                    loadingMore && styles.disabled,
                  ]}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : null}
                  <Text style={styles.secondaryButtonText}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
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
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  countBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  countText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  emptyCard: {
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.huge,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...cardShadow,
  },
  iconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondaryButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
  },
  loading: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "700",
  },
  error: {
    color: colors.error,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.55,
  },
  list: {
    gap: spacing.lg,
  },
  entry: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  question: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: "800",
  },
  demoLabel: {
    color: colors.primary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  answer: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 26,
  },
  date: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
});
