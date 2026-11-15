import { File, Paths } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnswerBlock } from "@/components/AnswerBlock";
import { AppText } from "@/components/AppText";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressAnnouncer } from "@/components/ProgressAnnouncer";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusBanner } from "@/components/StatusBanner";
import {
  deleteHistoryEntry,
  getHistoryEntry,
  getImage,
  synthesize,
  toFriendlyMessage,
  type HistoryItem,
} from "@/lib/api";
import { announce, describeDate } from "@/lib/a11y";
import { removeCachedHistoryEntry } from "@/lib/historyCache";
import { useSettings } from "@/lib/settings";
import { useSpeech } from "@/lib/useSpeech";

export default function HistoryDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<HistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { settings } = useSettings();
  const speech = useSpeech();
  const stopSpeech = speech.stop;
  const photoFile = useRef<File | null>(null);
  const audioFile = useRef<File | null>(null);
  const audioUri = useRef<string | null>(null);
  const objectUrls = useRef<string[]>([]);

  const loadEntry = useCallback(async () => {
    if (!id) {
      setError("History entry not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setEntry(await getHistoryEntry(id));
    } catch (cause) {
      const message = toFriendlyMessage(cause, "History entry not found.");
      setError(message);
      announce(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPhoto = useCallback(async (imageId: string) => {
    setPhotoLoading(true);
    setPhotoError("");
    try {
      const image = await getImage(imageId);
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([image.bytes], { type: image.mimeType || "image/jpeg" }),
        );
        objectUrls.current.push(url);
        setPhotoUri(url);
      } else {
        const ext = image.mimeType.includes("png") ? "png" : "jpg";
        const file = new File(
          Paths.cache,
          `asksight-history-photo-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
        );
        file.create({ intermediates: true });
        try {
          await file.write(new Uint8Array(image.bytes));
        } catch (cause) {
          if (file.exists) file.delete();
          throw cause;
        }
        photoFile.current = file;
        setPhotoUri(file.uri);
      }
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't load this photo. Please try again.",
      );
      setPhotoError(message);
      announce(message);
    } finally {
      setPhotoLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadEntry);
  }, [loadEntry]);

  useEffect(() => {
    if (entry) void Promise.resolve().then(() => loadPhoto(entry.image_id));
  }, [entry, loadPhoto]);

  async function playAnswer() {
    if (!entry) return;
    if (speech.isPlaying) {
      await speech.stop();
      return;
    }
    setTtsError("");
    setTtsLoading(true);
    try {
      let uri = audioUri.current;
      if (!uri) {
        const audio = await synthesize(entry.answer, settings.speechLanguage);
        if (Platform.OS === "web") {
          uri = URL.createObjectURL(
            new Blob([audio.bytes], { type: audio.mimeType || "audio/mpeg" }),
          );
          objectUrls.current.push(uri);
        } else {
          const file = new File(
            Paths.cache,
            `asksight-history-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
          );
          file.create({ intermediates: true });
          try {
            await file.write(new Uint8Array(audio.bytes));
          } catch (cause) {
            if (file.exists) file.delete();
            throw cause;
          }
          audioFile.current = file;
          uri = file.uri;
        }
        audioUri.current = uri;
      }
      await speech.play(uri, settings.speechRate);
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't play this answer. Please try again.",
      );
      setTtsError(message);
      announce(message);
    } finally {
      setTtsLoading(false);
    }
  }

  async function confirmDeleteEntry() {
    if (!entry || deleting) return;
    setConfirmDelete(false);
    setDeleting(true);
    setError("");
    try {
      await deleteHistoryEntry(entry.id);
      removeCachedHistoryEntry(entry.id);
      announce("Question deleted.");
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/history");
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't delete this question. Please try again.",
      );
      setError(message);
      announce(message);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(
    () => () => {
      void stopSpeech();
      if (photoFile.current?.exists) photoFile.current.delete();
      if (audioFile.current?.exists) audioFile.current.delete();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [stopSpeech],
  );

  const imageIsGone = photoError.includes("no longer available");

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ProgressAnnouncer
        working={loading}
        startMessage="Loading this question."
        stillWorkingMessage="Still loading this question."
        finishMessage={null}
      />
      <ScrollView contentContainerClassName="flex-grow px-6 py-6">
        <View className="mx-auto w-full max-w-[560px] gap-5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to history"
            onPress={() => router.back()}
            className="h-12 w-12 items-center justify-center rounded-full border-2 border-inputBorder bg-white"
          >
            <AppText variant="bodyLarge" className="font-bold text-ink">
              ←
            </AppText>
          </Pressable>
          <AppText
            variant="hero"
            accessibilityRole="header"
            className="text-ink"
          >
            Question details
          </AppText>
          {error ? <StatusBanner tone="error" message={error} /> : null}
          {loading ? (
            <View className="flex-row items-center gap-3 py-4">
              <ActivityIndicator color="#000000" />
              <AppText variant="bodyLarge" className="text-muted">
                Loading question…
              </AppText>
            </View>
          ) : null}
          {entry ? (
            <>
              {photoError ? (
                <StatusBanner tone="error" message={photoError} />
              ) : null}
              {photoLoading ? (
                <AppText
                  variant="body"
                  accessibilityLiveRegion="polite"
                  className="text-muted"
                >
                  Loading photo…
                </AppText>
              ) : null}
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  accessible
                  accessibilityLabel="Photo you asked about"
                  resizeMode="contain"
                  className="max-h-80 min-h-40 w-full rounded-card bg-field"
                />
              ) : null}
              <AnswerBlock
                question={entry.question}
                answer={entry.answer}
                onPlaybackPress={() => void playAnswer()}
                isPlaying={speech.isPlaying}
                isLoadingAudio={ttsLoading}
              />
              {ttsError ? (
                <StatusBanner tone="error" message={ttsError} />
              ) : null}
              <AppText variant="body" className="text-muted">
                Asked {describeDate(entry.created_at)} · Model{" "}
                {entry.model_version}
              </AppText>
              {!imageIsGone && photoUri ? (
                <PrimaryButton
                  label="Ask About This Photo Again"
                  onPress={() =>
                    router.push({
                      pathname: "/ask",
                      params: { image_id: entry.image_id, photo_uri: photoUri },
                    } as never)
                  }
                />
              ) : null}
              {photoError && !imageIsGone ? (
                <SecondaryButton
                  label="Retry Photo"
                  onPress={() => void loadPhoto(entry.image_id)}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={deleting}
                onPress={() => setConfirmDelete(true)}
                className="min-h-14 items-center justify-center rounded-field border-2 border-error bg-white px-5 py-3"
              >
                <AppText variant="bodyLarge" className="font-bold text-error">
                  {deleting
                    ? "Deleting question…"
                    : "Delete this question and its answer"}
                </AppText>
              </Pressable>
            </>
          ) : null}
          {!loading && !entry && !error ? (
            <SecondaryButton
              label="Back to History"
              onPress={() => router.back()}
            />
          ) : null}
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this question?"
        message="This deletes the question and its answer. The photo is also deleted if it was the last question about that photo. This cannot be undone."
        confirmLabel="Delete Question"
        cancelLabel="Keep Question"
        destructive
        onConfirm={() => void confirmDeleteEntry()}
        onCancel={() => setConfirmDelete(false)}
      />
    </SafeAreaView>
  );
}
