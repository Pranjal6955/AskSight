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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { cardShadow, colors, radius, spacing, tabBarSpace } from "@/theme";

function getImageType(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType) return asset.mimeType;
  return asset.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

export default function HomeScreen() {
  const { user, withAuth } = useAuth();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [now, setNow] = useState(() => new Date());
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    "upload" | "transcribe" | "ask" | "speak" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const speechPlayer = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const speechFile = useRef<File | null>(null);
  const speechUrl = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const clearSpeech = useCallback(() => {
    speechPlayer.current?.remove();
    speechPlayer.current = null;
    const file = speechFile.current;
    speechFile.current = null;
    if (file?.exists) {
      try {
        file.delete();
      } catch {
        // Cache files can be evicted by the OS before cleanup.
      }
    }
    if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
    speechUrl.current = null;
  }, []);

  useEffect(() => clearSpeech, [clearSpeech]);

  async function acceptPhoto(asset: ImagePicker.ImagePickerAsset) {
    clearSpeech();
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

  async function removePhoto() {
    clearSpeech();
    if (imageId && !answer) {
      try {
        await withAuth((token) => api.deleteImage(token, imageId));
      } catch {
        // Best-effort cleanup; removing the photo should still work.
      }
    }
    setPhoto(null);
    setImageId(null);
    setQuestion("");
    setAnswer(null);
    setError(null);
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
    if (!imageId || !photo || !question.trim() || busy) return;
    setBusy("ask");
    setError(null);
    setAnswer(null);
    try {
      const result = await withAuth((token) =>
        api.ask(token, { image_id: imageId, question: question.trim() }),
      );
      setAnswer(result.answer);
      await speakAnswer(result.answer);
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

  async function speakAnswer(text: string) {
    setBusy("speak");
    setError(null);
    try {
      const audio = await withAuth((token) =>
        api.synthesizeSpeech(token, text),
      );
      clearSpeech();

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

  async function listenToAnswer() {
    if (!answer || busy) return;
    await speakAnswer(answer);
  }

  const isRecording = recorderState.isRecording;
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.name.trim().split(/\s+/)[0];

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
            <View style={styles.welcome}>
              <Text accessibilityRole="header" style={styles.welcomeTitle}>
                {greeting}{firstName ? `, ${firstName}` : ""}!
              </Text>
            </View>

            {!photo ? (
              <View style={styles.main}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.hero}
                >
                  <Text style={styles.heroEmoji}>👀</Text>
                </View>
                <Text accessibilityRole="header" style={styles.title}>
                  What do you see?
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Take a photo"
                    onPress={takePhoto}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                    ]}
                  >
                    <Ionicons name="camera" size={22} color={colors.white} />
                    <Text style={styles.primaryButtonText}>Take a photo</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose a photo from your library"
                    onPress={choosePhoto}
                    style={({ pressed }) => [
                      styles.linkButton,
                      pressed && styles.linkButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name="images-outline"
                      size={23}
                      color={colors.primary}
                    />
                    <Text style={styles.linkButtonText}>Choose from library</Text>
                  </Pressable>
                </View>

                {error ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.workflow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to home"
                  accessibilityState={{ disabled: busy !== null || isRecording }}
                  disabled={busy !== null || isRecording}
                  onPress={removePhoto}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed && styles.backButtonPressed,
                    (busy !== null || isRecording) && styles.disabled,
                  ]}
                >
                  <Ionicons name="arrow-back" size={23} color={colors.primary} />
                  <Text style={styles.backButtonText}>Back to home</Text>
                </Pressable>

                <View style={styles.previewWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.preview} />
                  {busy === "upload" ? (
                    <View style={styles.uploadOverlay}>
                      <ActivityIndicator color={colors.white} />
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    disabled={busy !== null || isRecording}
                    onPress={removePhoto}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.removePhoto,
                      pressed && styles.pressed,
                      (busy !== null || isRecording) && styles.disabled,
                    ]}
                  >
                    <Ionicons name="close" size={20} color={colors.white} />
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isRecording ? "Stop recording" : "Ask by voice"
                  }
                  accessibilityHint={
                    isRecording
                      ? "Tap to finish your spoken question"
                      : "Tap, then speak your question"
                  }
                  accessibilityState={{
                    busy: busy === "transcribe",
                    disabled: !imageId || busy !== null,
                  }}
                  disabled={!imageId || busy !== null}
                  onPress={recordQuestion}
                  style={({ pressed }) => [
                    styles.voiceButton,
                    isRecording && styles.voiceButtonRecording,
                    pressed && styles.voiceButtonPressed,
                    (!imageId || busy !== null) && styles.disabled,
                  ]}
                >
                  {busy === "transcribe" ? (
                    <ActivityIndicator color={colors.white} size="large" />
                  ) : (
                    <Ionicons
                      name={isRecording ? "stop-circle" : "mic"}
                      size={34}
                      color={colors.white}
                    />
                  )}
                  <View style={styles.voiceButtonCopy}>
                    <Text style={styles.voiceButtonTitle}>
                      {busy === "transcribe"
                        ? "Transcribing…"
                        : isRecording
                          ? "Stop recording"
                          : "Ask by voice"}
                    </Text>
                    <Text style={styles.voiceButtonHint}>
                      {isRecording
                        ? "Tap when you finish speaking"
                        : "Tap and speak your question"}
                    </Text>
                  </View>
                </Pressable>

                <View style={styles.inputRow}>
                  <TextInput
                    accessibilityLabel="Your question"
                    value={question}
                    onChangeText={setQuestion}
                    placeholder="Or type a question…"
                    placeholderTextColor={colors.muted}
                    multiline
                    maxLength={500}
                    editable={busy === null && !isRecording}
                    style={styles.input}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ask AskSight"
                  accessibilityHint="Get an answer spoken aloud"
                  accessibilityState={{
                    busy: busy === "ask",
                    disabled: !imageId || !question.trim(),
                  }}
                  disabled={
                    !imageId || !question.trim() || busy !== null || isRecording
                  }
                  onPress={askQuestion}
                  style={({ pressed }) => [
                    styles.askButton,
                    pressed && styles.askButtonPressed,
                    (!imageId ||
                      !question.trim() ||
                      busy !== null ||
                      isRecording) &&
                      styles.disabled,
                  ]}
                >
                  {busy === "ask" ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.askText}>Get answer</Text>
                  )}
                </Pressable>

                {error ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                ) : null}

                {answer ? (
                  <View accessibilityLiveRegion="polite" style={styles.answerCard}>
                    <View style={styles.answerIcon}>
                      <Ionicons
                        name="volume-high"
                        size={30}
                        color={colors.primary}
                      />
                    </View>
                    <Text accessibilityRole="header" style={styles.answerTitle}>
                      {busy === "speak" ? "Preparing your spoken answer" : "Answer ready"}
                    </Text>
                    <Text accessibilityRole="text" style={styles.answerBody}>
                      {answer}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Listen to the answer again"
                      accessibilityState={{ busy: busy === "speak" }}
                      disabled={busy !== null}
                      onPress={listenToAnswer}
                      style={({ pressed }) => [
                        styles.listenButton,
                        pressed && styles.listenButtonPressed,
                        busy !== null && styles.disabled,
                      ]}
                    >
                      {busy === "speak" ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <Ionicons
                          name="play"
                          size={20}
                          color={colors.white}
                        />
                      )}
                      <Text style={styles.listenButtonText}>Listen again</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )}
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
    paddingTop: spacing.sm,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  welcome: {
    marginBottom: spacing.xl,
  },
  welcomeTitle: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  main: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.huge,
  },
  hero: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  heroEmoji: {
    fontSize: 70,
    lineHeight: 84,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.6,
    textAlign: "center",
    marginBottom: spacing.xxxl,
  },
  actions: {
    width: "100%",
    gap: spacing.sm,
  },
  primaryButton: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  primaryButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "800",
  },
  linkButton: {
    minHeight: 60,
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  linkButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  linkButtonText: {
    color: colors.primary,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
  error: {
    color: colors.error,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
    marginTop: spacing.lg,
  },
  workflow: {
    gap: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  backButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  previewWrap: {
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  preview: {
    width: "100%",
    height: 300,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  uploadOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.xl,
    backgroundColor: "rgba(28, 36, 22, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  removePhoto: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(28, 36, 22, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  input: {
    flex: 1,
    minHeight: 100,
    paddingVertical: spacing.md,
    color: colors.ink,
    fontSize: 18,
    lineHeight: 26,
    textAlignVertical: "top",
  },
  voiceButton: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
  },
  voiceButtonRecording: {
    backgroundColor: colors.error,
  },
  voiceButtonPressed: {
    opacity: 0.85,
  },
  voiceButtonCopy: {
    flex: 1,
  },
  voiceButtonTitle: {
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  voiceButtonHint: {
    color: "#F4F2E9",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  askButton: {
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  askButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  askText: {
    color: colors.white,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "800",
  },
  answerCard: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  answerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  answerTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  answerBody: {
    width: "100%",
    color: colors.ink,
    fontSize: 20,
    lineHeight: 29,
    fontWeight: "600",
  },
  listenButton: {
    width: "100%",
    minHeight: 58,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  listenButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  listenButtonText: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
});
