import Ionicons from "@expo/vector-icons/Ionicons";
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, radius, spacing, tabBarSpace } from "@/theme";

type ActionProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

function HomeAction({ icon, title, onPress, disabled = false }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        disabled && styles.disabled,
        pressed && !disabled && styles.actionPressed,
      ]}
    >
      <Ionicons name={icon} size={28} color={colors.primary} />
      <Text style={styles.actionTitle}>{title}</Text>
      <Ionicons
        name="chevron-forward"
        size={24}
        color={colors.primary}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

function getImageType(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType) return asset.mimeType;
  return asset.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

export default function HomeScreen() {
  const { user, withAuth } = useAuth();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const initial = (user?.name?.trim()[0] ?? "A").toUpperCase();
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isDemoAnswer, setIsDemoAnswer] = useState(false);
  const [busy, setBusy] = useState<
    "upload" | "transcribe" | "ask" | "speak" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const speechPlayer = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const speechFile = useRef<File | null>(null);
  const speechUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      speechPlayer.current?.remove();
      speechFile.current?.delete();
      if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
    },
  );

  async function acceptPhoto(asset: ImagePicker.ImagePickerAsset) {
    if (imageId && !answer) {
      try {
        await withAuth((token) => api.deleteImage(token, imageId));
      } catch {
        // Replacing a photo should still work if best-effort cleanup fails.
      }
    }
    setPhoto(asset);
    setImageId(null);
    setQuestion("");
    setAnswer(null);
    setIsDemoAnswer(false);
    setError(null);
    setBusy("upload");

    const extension = asset.fileName?.split(".").pop()?.toLowerCase();
    const name = asset.fileName ?? `asksight-photo.${extension || "jpg"}`;

    try {
      const uploaded = await withAuth((token) =>
        api.uploadImage(token, {
          uri: asset.uri,
          name,
          type: getImageType(asset),
        }),
      );
      setImageId(uploaded.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photo upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function takePhoto() {
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("Allow camera access to take a photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (!result.canceled) await acceptPhoto(result.assets[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open camera.");
    }
  }

  async function choosePhoto() {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (!result.canceled) await acceptPhoto(result.assets[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open photos.");
    }
  }

  async function recordQuestion() {
    if (recorderState.isRecording) {
      setBusy("transcribe");
      setError(null);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("No recording was saved. Please try again.");
        const extension = uri.split(".").pop()?.split("?")[0] ?? "m4a";
        const type = extension === "webm" ? "audio/webm" : "audio/mp4";
        const result = await withAuth((token) =>
          api.transcribeAudio(token, {
            uri,
            name: `question.${extension}`,
            type,
          }),
        );
        setQuestion(result.transcript);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not hear that.");
      } finally {
        setBusy(null);
        try {
          await setAudioModeAsync({ allowsRecording: false });
        } catch {
          // Audio mode cleanup should not hide a transcription result.
        }
      }
      return;
    }

    if (!imageId) {
      setError("Choose a photo first.");
      return;
    }
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("Allow microphone access to speak your question.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start recording.");
    }
  }

  async function askQuestion() {
    if (!imageId || !question.trim() || busy) return;
    setBusy("ask");
    setError(null);
    setAnswer(null);
    try {
      const result = await withAuth((token) =>
        api.ask(token, { image_id: imageId, question: question.trim() }),
      );
      setAnswer(result.answer);
      setIsDemoAnswer(result.model_version === "mock-0.0.0");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not get an answer.";
      setError(
        cause instanceof ApiError && cause.status === 503
          ? "AskSight is not ready. Try again soon."
          : message,
      );
    } finally {
      setBusy(null);
    }
  }

  async function listenToAnswer() {
    if (!answer || busy) return;
    setBusy("speak");
    setError(null);
    try {
      const audio = await withAuth((token) =>
        api.synthesizeSpeech(token, answer),
      );
      speechPlayer.current?.remove();
      speechFile.current?.delete();
      if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);

      let source: string;
      if (Platform.OS === "web") {
        speechUrl.current = URL.createObjectURL(
          new Blob([audio], { type: "audio/mpeg" }),
        );
        source = speechUrl.current;
      } else {
        const file = new File(Paths.cache, `asksight-answer-${Date.now()}.mp3`);
        file.create();
        await file.write(audio);
        speechFile.current = file;
        source = file.uri;
      }

      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      speechPlayer.current = createAudioPlayer(source);
      speechPlayer.current.play();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not play the answer.");
    } finally {
      setBusy(null);
    }
  }

  const isRecording = recorderState.isRecording;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: tabBarSpace + insets.bottom + spacing.xxl },
          ]}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.brand}>AskSight</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Account"
                onPress={() => router.push("/(tabs)/account")}
                style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
              >
                <Text style={styles.avatarText}>{initial}</Text>
              </Pressable>
            </View>

            {!photo ? (
              <View style={styles.main}>
                <Text accessibilityRole="header" style={styles.title}>
                  Ask about a photo
                </Text>
                <View style={styles.actions}>
                  <HomeAction icon="camera-outline" title="Take a photo" onPress={takePhoto} />
                  <HomeAction icon="image-outline" title="Choose a photo" onPress={choosePhoto} />
                </View>
              </View>
            ) : (
              <View style={styles.workflow}>
                <Image source={{ uri: photo.uri }} style={styles.preview} />
                <Text style={styles.status}>
                  {busy === "upload"
                    ? "Uploading photo…"
                    : imageId
                      ? "Photo ready"
                      : "Photo not uploaded"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose a different photo"
                  onPress={choosePhoto}
                  disabled={busy !== null || isRecording}
                  style={styles.changePhoto}
                >
                  <Text style={styles.linkText}>Choose a different photo</Text>
                </Pressable>

                <Text style={styles.label}>Your question</Text>
                <TextInput
                  accessibilityLabel="Your question"
                  value={question}
                  onChangeText={setQuestion}
                  placeholder="What is this?"
                  placeholderTextColor={colors.muted}
                  multiline
                  maxLength={500}
                  editable={busy === null && !isRecording}
                  style={styles.input}
                />

                <View style={styles.questionActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isRecording ? "Stop recording" : "Record question"}
                    accessibilityState={{ busy: busy === "transcribe" }}
                    disabled={busy !== null || !imageId}
                    onPress={recordQuestion}
                    style={({ pressed }) => [
                      styles.voiceButton,
                      isRecording && styles.recordingButton,
                      pressed && styles.actionPressed,
                      (busy !== null || !imageId) && styles.disabled,
                    ]}
                  >
                    <Ionicons
                      name={isRecording ? "stop" : "mic-outline"}
                      size={24}
                      color={colors.primary}
                    />
                    <Text style={styles.voiceText}>
                      {isRecording
                        ? "Stop recording"
                        : busy === "transcribe"
                          ? "Listening…"
                          : "Speak"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ask AskSight"
                    accessibilityState={{ busy: busy === "ask", disabled: !imageId || !question.trim() }}
                    disabled={!imageId || !question.trim() || busy !== null || isRecording}
                    onPress={askQuestion}
                    style={({ pressed }) => [
                      styles.askButton,
                      pressed && styles.askButtonPressed,
                      (!imageId || !question.trim() || busy !== null || isRecording) && styles.disabledAsk,
                    ]}
                  >
                    <Text style={styles.askText}>
                      {busy === "ask" ? "Asking…" : "Ask"}
                    </Text>
                  </Pressable>
                </View>

                {error ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                ) : null}

                {answer ? (
                  <View accessibilityLiveRegion="polite" style={styles.answerCard}>
                    <Text style={styles.answerLabel}>
                      {isDemoAnswer ? "Demo answer" : "Answer"}
                    </Text>
                    <Text style={styles.answerText}>{answer}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Listen to answer"
                      accessibilityState={{ busy: busy === "speak" }}
                      disabled={busy !== null}
                      onPress={listenToAnswer}
                      style={({ pressed }) => [
                        styles.listenButton,
                        pressed && styles.actionPressed,
                        busy !== null && styles.disabled,
                      ]}
                    >
                      <Ionicons
                        name="volume-high-outline"
                        size={24}
                        color={colors.primary}
                      />
                      <Text style={styles.voiceText}>
                        {busy === "speak" ? "Preparing audio…" : "Listen"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )}

            {!photo && error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
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
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xxxl,
  },
  brand: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.white,
    fontSize: 21,
    fontWeight: "800",
  },
  main: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: spacing.huge,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: spacing.xxxl,
  },
  actions: {
    gap: spacing.lg,
  },
  action: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  actionTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  actionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  workflow: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  status: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  changePhoto: {
    alignSelf: "center",
    paddingVertical: spacing.xs,
  },
  linkText: {
    color: colors.primary,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  label: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
  },
  input: {
    minHeight: 100,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 19,
    lineHeight: 27,
    textAlignVertical: "top",
  },
  questionActions: {
    gap: spacing.md,
  },
  voiceButton: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  recordingButton: {
    borderColor: colors.error,
  },
  voiceText: {
    color: colors.primary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  askButton: {
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  askButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  disabledAsk: {
    opacity: 0.5,
  },
  askText: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  error: {
    color: colors.error,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  answerCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  answerLabel: {
    color: colors.primary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  answerText: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 28,
  },
  listenButton: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
