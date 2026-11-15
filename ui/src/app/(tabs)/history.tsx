import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { HistoryRow } from "@/components/HistoryRow";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusBanner } from "@/components/StatusBanner";
import { PrimaryButton } from "@/components/PrimaryButton";
import { listHistory, toFriendlyMessage, type HistoryPage } from "@/lib/api";
import {
  getCachedHistory,
  setCachedHistory,
  subscribeHistoryCache,
} from "@/lib/historyCache";
import { announce } from "@/lib/a11y";

const PAGE_SIZE = 20;

export default function HistoryScreen() {
  const [page, setPage] = useState<HistoryPage | null>(getCachedHistory());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  useEffect(
    () =>
      subscribeHistoryCache(() => {
        setPage(getCachedHistory());
      }),
    [],
  );

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await listHistory({ limit: PAGE_SIZE });
      setPage(result);
      setCachedHistory(result);
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't load your questions. Please try again.",
      );
      setError(message);
      announce(message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const loadMore = useCallback(async () => {
    const cursor = page?.next_cursor;
    if (!page?.has_more || !cursor || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    setError("");
    announce("Loading more questions.");
    try {
      const result = await listHistory({ cursor, limit: PAGE_SIZE });
      const current = getCachedHistory() ?? page;
      const knownIds = new Set(current.items.map((item) => item.id));
      const merged: HistoryPage = {
        ...result,
        items: [
          ...current.items,
          ...result.items.filter((item) => !knownIds.has(item.id)),
        ],
      };
      setPage(merged);
      setCachedHistory(merged);
      announce("More questions loaded.");
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't load more questions. Please try again.",
      );
      setError(message);
      announce(message);
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [page]);

  const cached = getCachedHistory();
  const offlineWithCache = Boolean(
    cached?.items.length && error.includes("couldn't connect to AskSight"),
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
          />
        }
        contentContainerClassName="flex-grow px-6 pb-32 pt-8"
      >
        <View className="mx-auto w-full max-w-[560px] gap-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <AppText
                variant="hero"
                accessibilityRole="header"
                className="text-ink"
              >
                History
              </AppText>
              <AppText variant="bodyLarge" className="mt-2 text-muted">
                Return to questions you have asked.
              </AppText>
            </View>
            <SecondaryButton
              label="Refresh"
              loading={loading}
              onPress={() => void refresh()}
            />
          </View>

          {offlineWithCache ? (
            <StatusBanner
              tone="warning"
              message="You're offline. Showing saved questions."
            />
          ) : null}
          {error && !offlineWithCache ? (
            <StatusBanner tone="error" message={error} />
          ) : null}

          {loading && !page ? (
            <AppText
              variant="bodyLarge"
              accessibilityLiveRegion="polite"
              className="py-6 text-muted"
            >
              Loading your questions…
            </AppText>
          ) : null}

          {page?.items.length ? (
            <View className="overflow-hidden rounded-card border-2 border-inputBorder bg-white">
              {page.items.map((item) => (
                <HistoryRow
                  key={item.id}
                  question={item.question}
                  answer={item.answer}
                  createdAt={item.created_at}
                  onPress={() => router.push(`/history/${item.id}` as never)}
                />
              ))}
            </View>
          ) : null}

          {!loading && !error && page && page.items.length === 0 ? (
            <View className="items-center gap-4 rounded-card border-2 border-inputBorder bg-white px-6 py-10">
              <View
                className="h-20 w-20 items-center justify-center rounded-full bg-field"
                importantForAccessibility="no-hide-descendants"
              >
                <MaterialCommunityIcons
                  name="history"
                  size={40}
                  color="#000000"
                />
              </View>
              <AppText variant="section" className="text-center text-ink">
                No questions yet
              </AppText>
              <AppText variant="bodyLarge" className="text-center text-muted">
                Your past questions will appear here.
              </AppText>
              <PrimaryButton
                label="Ask your first question"
                onPress={() => router.navigate("/(tabs)/home")}
              />
            </View>
          ) : null}

          {!loading && error && !page?.items.length ? (
            <SecondaryButton label="Try Again" onPress={() => void refresh()} />
          ) : null}

          {page?.has_more ? (
            <SecondaryButton
              label="Load More"
              loading={loadingMore}
              loadingLabel="Loading more…"
              onPress={() => void loadMore()}
            />
          ) : null}
          {page?.items.length && !page.has_more ? (
            <AppText
              variant="supporting"
              className="py-2 text-center text-muted"
            >
              You have reached the end of your history.
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
