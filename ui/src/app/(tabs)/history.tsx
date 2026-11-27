import Ionicons from "@expo/vector-icons/Ionicons";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Image } from "expo-image";
import { File, Paths } from "expo-file-system";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { HistoryItem } from "@/lib/api";
import * as api from "@/lib/api";
import { API_URL } from "@/lib/api";
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
  const { accessToken, withAuth } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const speechPlayer = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const speechFile = useRef<File | null>(null);
  const speechUrl = useRef<string | null>(null);

  const clearSpeech = useCallback(() => {
    speechPlayer.current?.remove();
    speechPlayer.current = null;
    speechFile.current?.delete();
    speechFile.current = null;
    if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
    speechUrl.current = null;
  }, []);

  useEffect(() => clearSpeech, [clearSpeech]);

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

  async function deleteItem(item: HistoryItem) {
    setDeletingId(item.id);
    setError(null);
    try {
      await withAuth((token) => api.deleteHistoryItem(token, item.id));
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== item.id));
      setExpandedId((current) => (current === item.id ? null : current));
      setDeletePromptId(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete this history item.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  function resetSelection() {
    setSelectedIds([]);
    setSelectionMode(false);
    setConfirmBulkDelete(false);
  }

  async function deleteSelected() {
    const targets = visibleItems.filter((item) => selectedIds.includes(item.id));
    if (targets.length === 0 || bulkDeleting) return;

    setBulkDeleting(true);
    setError(null);
    const results = await Promise.allSettled(
      targets.map((item) =>
        withAuth((token) => api.deleteHistoryItem(token, item.id)),
      ),
    );
    const deletedIds = new Set(
      targets
        .filter((_, index) => results[index].status === "fulfilled")
        .map((item) => item.id),
    );
    const failedCount = targets.length - deletedIds.size;
    setItems((current) => current.filter((item) => !deletedIds.has(item.id)));
    setSelectedIds([]);
    setSelectionMode(false);
    setConfirmBulkDelete(false);
    if (failedCount > 0) {
      setError(
        deletedIds.size > 0
          ? `Deleted ${deletedIds.size} item(s). ${failedCount} could not be deleted.`
          : "Could not delete the selected history items.",
      );
    }
    setBulkDeleting(false);
  }

  async function listenToItem(item: HistoryItem) {
    if (speakingId) return;
    setSpeakingId(item.id);
    setError(null);
    try {
      const audio = await withAuth((token) =>
        api.synthesizeSpeech(token, item.answer),
      );
      clearSpeech();

      let source: string;
      if (Platform.OS === "web") {
        speechUrl.current = URL.createObjectURL(
          new Blob([audio], { type: "audio/mpeg" }),
        );
        source = speechUrl.current;
      } else {
        const file = new File(Paths.cache, `asksight-history-${item.id}.mp3`);
        file.create();
        await file.write(audio);
        speechFile.current = file;
        source = file.uri;
      }

      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      speechPlayer.current = createAudioPlayer(source);
      speechPlayer.current.play();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not play this answer.",
      );
    } finally {
      setSpeakingId(null);
    }
  }

  const searchTerm = query.trim().toLocaleLowerCase();
  const visibleItems = items
    .filter((item) => {
      if (!searchTerm) return true;
      return `${item.question} ${item.answer}`
        .toLocaleLowerCase()
        .includes(searchTerm);
    })
    .sort((left, right) => {
      const dateOrder =
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime();
      return sortOrder === "newest" ? -dateOrder : dateOrder;
    });

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
            <Text accessibilityRole="header" style={styles.title}>
              History
            </Text>
            <View style={styles.countBadge}>
              <Text accessibilityLabel={`${items.length}${hasMore ? " or more" : ""} saved entries`} style={styles.countText}>
                {items.length}{hasMore ? "+" : ""}
              </Text>
            </View>
          </View>

          {!loading && items.length > 0 ? (
            <View style={styles.historyTools}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color={colors.muted} />
                <TextInput
                  accessibilityLabel="Search history"
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                    setSelectedIds([]);
                    setConfirmBulkDelete(false);
                  }}
                  placeholder="Search history"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {query ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear history search"
                    onPress={() => setQuery("")}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.listToolbar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sort ${sortOrder === "newest" ? "oldest" : "newest"} first`}
                  onPress={() => setSortOrder((order) => order === "newest" ? "oldest" : "newest")}
                  style={({ pressed }) => [
                    styles.sortButton,
                    pressed && styles.controlPressed,
                  ]}
                >
                  <Ionicons name="swap-vertical" size={19} color={colors.primary} />
                  <Text style={styles.sortText}>
                    {sortOrder === "newest" ? "Newest first" : "Oldest first"}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.primary} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectionMode }}
                  onPress={() => {
                    if (selectionMode) {
                      resetSelection();
                    } else {
                      setSelectionMode(true);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.selectButton,
                    selectionMode && styles.selectButtonActive,
                    pressed && styles.controlPressed,
                  ]}
                >
                  <Ionicons
                    name={selectionMode ? "close" : "checkbox-outline"}
                    size={18}
                    color={selectionMode ? colors.white : colors.primary}
                  />
                  <Text
                    style={[
                      styles.selectButtonText,
                      selectionMode && styles.selectButtonTextActive,
                    ]}
                  >
                    {selectionMode ? "Cancel" : "Select"}
                  </Text>
                </Pressable>
              </View>

              {selectionMode ? (
                <View style={styles.selectionPanel}>
                  <Text style={styles.selectionCount}>
                    {selectedIds.length} selected
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      visibleItems.length > 0 &&
                      visibleItems.every((item) => selectedIds.includes(item.id))
                        ? "Clear selection"
                        : "Select all shown history items"
                    }
                    onPress={() => {
                      const allShownSelected =
                        visibleItems.length > 0 &&
                        visibleItems.every((item) => selectedIds.includes(item.id));
                      setSelectedIds(
                        allShownSelected ? [] : visibleItems.map((item) => item.id),
                      );
                      setConfirmBulkDelete(false);
                    }}
                    style={styles.selectAllButton}
                  >
                    <Text style={styles.selectAllText}>
                      {visibleItems.length > 0 &&
                      visibleItems.every((item) => selectedIds.includes(item.id))
                        ? "Clear all"
                        : "Select all shown"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: selectedIds.length === 0 }}
                    disabled={selectedIds.length === 0 || bulkDeleting}
                    onPress={() => setConfirmBulkDelete(true)}
                    style={({ pressed }) => [
                      styles.bulkDeleteButton,
                      pressed && styles.bulkDeletePressed,
                      (selectedIds.length === 0 || bulkDeleting) && styles.disabled,
                    ]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.white} />
                    <Text style={styles.bulkDeleteText}>
                      Delete ({selectedIds.length})
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {confirmBulkDelete ? (
                <View style={styles.bulkDeleteConfirm}>
                  <Text style={styles.bulkDeleteConfirmTitle}>
                    Delete {selectedIds.length} selected {selectedIds.length === 1 ? "entry" : "entries"}?
                  </Text>
                  <Text style={styles.bulkDeleteConfirmHint}>
                    The saved answers will be removed. Photos will stay.
                  </Text>
                  <View style={styles.deleteActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={bulkDeleting}
                      onPress={() => setConfirmBulkDelete(false)}
                      style={styles.cancelDeleteButton}
                    >
                      <Text style={styles.cancelDeleteText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ busy: bulkDeleting }}
                      disabled={bulkDeleting}
                      onPress={() => void deleteSelected()}
                      style={styles.confirmDeleteButton}
                    >
                      {bulkDeleting ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color={colors.white} />
                      )}
                      <Text style={styles.confirmDeleteText}>
                        {bulkDeleting ? "Deleting…" : "Delete selected"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {loading ? (
            <View accessibilityLiveRegion="polite" style={styles.loading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading history</Text>
            </View>
          ) : items.length === 0 && error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : items.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.iconCircle}>
                <Ionicons name="time-outline" size={38} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No questions yet</Text>
              <Text style={styles.emptyCopy}>
                Questions you ask about photos will appear here.
              </Text>
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
              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}
              {visibleItems.length === 0 ? (
                <View style={styles.noResults}>
                  <Ionicons
                    name="search-outline"
                    size={28}
                    color={colors.muted}
                  />
                  <Text style={styles.noResultsText}>No matching history</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setQuery("");
                      setSelectedIds([]);
                    }}
                  >
                    <Text style={styles.expandText}>Clear search</Text>
                  </Pressable>
                </View>
              ) : null}
              {visibleItems.map((item) => {
                const expanded = expandedId === item.id;
                const confirmingDelete = deletePromptId === item.id;
                const deleting = deletingId === item.id;
                const speaking = speakingId === item.id;
                const selected = selectedIds.includes(item.id);

                return (
                  <View key={item.id} style={styles.entry}>
                    <View style={styles.entrySummary}>
                      {selectionMode ? (
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityLabel={`Select history item: ${item.question}`}
                          accessibilityState={{ checked: selected }}
                          onPress={() => toggleSelected(item.id)}
                          style={styles.checkButton}
                        >
                          <Ionicons
                            name={selected ? "checkbox" : "square-outline"}
                            size={25}
                            color={selected ? colors.primary : colors.muted}
                          />
                        </Pressable>
                      ) : null}
                      <View style={styles.entryImageFrame}>
                        {accessToken && !failedImageIds.includes(item.id) ? (
                          <Image
                            accessibilityLabel="Photo for this question"
                            accessible
                            cachePolicy="memory"
                            contentFit="cover"
                            onError={() =>
                              setFailedImageIds((current) =>
                                current.includes(item.id)
                                  ? current
                                  : [...current, item.id],
                              )
                            }
                            source={{
                              uri: `${API_URL}${item.image_url}`,
                              headers: { Authorization: `Bearer ${accessToken}` },
                            }}
                            style={styles.entryImage}
                          />
                        ) : (
                          <View
                            accessibilityLabel="Photo unavailable"
                            accessible
                            style={styles.entryImageFallback}
                          >
                            <Ionicons
                              name="image-outline"
                              size={30}
                              color={colors.muted}
                            />
                          </View>
                        )}
                      </View>

                      <View style={styles.entrySummaryContent}>
                        <Text accessibilityRole="header" style={styles.question} numberOfLines={3}>
                          {item.question}
                        </Text>
                        <View style={styles.entrySummaryActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${expanded ? "Collapse" : "Open"} history item: ${item.question}`}
                            accessibilityState={{ expanded }}
                            onPress={() => setExpandedId(expanded ? null : item.id)}
                            style={({ pressed }) => [
                              styles.openDetailsButton,
                              pressed && styles.entryContentPressed,
                            ]}
                          >
                            <Text style={styles.expandText}>
                              {expanded
                                ? "Close"
                                : selectionMode
                                  ? "Open"
                                  : "Open answer"}
                            </Text>
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${speaking ? "Playing" : "Listen to answer for"}: ${item.question}`}
                            accessibilityState={{ busy: speaking, disabled: speakingId !== null }}
                            disabled={speakingId !== null}
                            onPress={() => void listenToItem(item)}
                            style={({ pressed }) => [
                              styles.speakerButton,
                              pressed && styles.speakerButtonPressed,
                              speakingId !== null && styles.disabled,
                            ]}
                          >
                            {speaking ? (
                              <ActivityIndicator color={colors.white} size="small" />
                            ) : (
                              <Ionicons
                                name="volume-high"
                                size={26}
                                color={colors.white}
                              />
                            )}
                          </Pressable>
                        </View>
                      </View>
                    </View>

                    {expanded ? (
                      <View style={styles.entryDetails}>
                        <View style={styles.detailDivider} />
                        <Text style={styles.detailLabel}>Question</Text>
                        <Text style={styles.questionDetail}>{item.question}</Text>
                        <Text style={styles.detailLabel}>Answer</Text>
                        <Text style={styles.answer}>{item.answer}</Text>

                        {confirmingDelete ? (
                          <View style={styles.deleteConfirm}>
                            <View style={styles.deleteCopy}>
                              <Text style={styles.deleteTitle}>
                                Delete this answer?
                              </Text>
                              <Text style={styles.deleteHint}>
                                The photo will stay.
                              </Text>
                            </View>
                            <View style={styles.deleteActions}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Cancel deleting history item"
                                disabled={deleting}
                                onPress={() => setDeletePromptId(null)}
                                style={({ pressed }) => [
                                  styles.cancelDeleteButton,
                                  pressed && styles.cancelDeletePressed,
                                  deleting && styles.disabled,
                                ]}
                              >
                                <Text style={styles.cancelDeleteText}>
                                  Cancel
                                </Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Confirm delete history item"
                                accessibilityState={{ busy: deleting }}
                                disabled={deleting}
                                onPress={() => void deleteItem(item)}
                                style={({ pressed }) => [
                                  styles.confirmDeleteButton,
                                  pressed && styles.confirmDeletePressed,
                                  deleting && styles.disabled,
                                ]}
                              >
                                {deleting ? (
                                  <ActivityIndicator
                                    color={colors.white}
                                    size="small"
                                  />
                                ) : (
                                  <Ionicons
                                    name="trash-outline"
                                    size={18}
                                    color={colors.white}
                                  />
                                )}
                                <Text style={styles.confirmDeleteText}>
                                  {deleting ? "Deleting…" : "Delete"}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Delete this history item"
                            onPress={() => setDeletePromptId(item.id)}
                            style={({ pressed }) => [
                              styles.deleteButton,
                              pressed && styles.deleteButtonPressed,
                            ]}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={19}
                              color={colors.error}
                            />
                            <Text style={styles.deleteButtonText}>Delete</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
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
  historyTools: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  searchBox: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
  },
  listToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sortButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  sortText: {
    color: colors.primary,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },
  selectButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  selectButtonActive: {
    backgroundColor: colors.primary,
  },
  selectButtonText: {
    color: colors.primary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  selectButtonTextActive: {
    color: colors.white,
  },
  controlPressed: {
    opacity: 0.8,
  },
  selectionPanel: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  selectionCount: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  selectAllButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  selectAllText: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  bulkDeleteButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.error,
  },
  bulkDeletePressed: {
    opacity: 0.85,
  },
  bulkDeleteText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  bulkDeleteConfirm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.errorSoft,
  },
  bulkDeleteConfirmTitle: {
    color: colors.error,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  bulkDeleteConfirmHint: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  countBadge: {
    minWidth: 64,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  countText: {
    color: colors.primary,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
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
  emptyCopy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: spacing.xl,
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
  noResults: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  noResultsText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  entry: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  entrySummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  entryImageFrame: {
    width: 84,
    height: 84,
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  entryImage: {
    width: "100%",
    height: "100%",
  },
  entryImageFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  checkButton: {
    width: 34,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  entrySummaryContent: {
    flex: 1,
    gap: spacing.sm,
    minHeight: 82,
    justifyContent: "center",
    borderRadius: radius.md,
  },
  openDetailsButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  entryContentPressed: {
    opacity: 0.82,
  },
  speakerButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  speakerButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  entrySummaryActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  expandText: {
    color: colors.primary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  entryDetails: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  detailLabel: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  questionDetail: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: "700",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  deleteButtonPressed: {
    backgroundColor: colors.errorSoft,
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  deleteConfirm: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.errorSoft,
  },
  deleteCopy: {
    gap: spacing.xs,
  },
  deleteTitle: {
    color: colors.error,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },
  deleteHint: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
  },
  deleteActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  cancelDeleteButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  cancelDeletePressed: {
    backgroundColor: colors.surface,
  },
  cancelDeleteText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  confirmDeleteButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.error,
  },
  confirmDeletePressed: {
    opacity: 0.85,
  },
  confirmDeleteText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  question: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
  },
  answer: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 30,
  },
});
