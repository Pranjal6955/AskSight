import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { File, Paths } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { MicButton } from "@/components/MicButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressAnnouncer } from "@/components/ProgressAnnouncer";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusBanner } from "@/components/StatusBanner";
import { ThinkingPanel } from "@/components/ThinkingPanel";
import { synthesize, toFriendlyMessage, transcribe, type UploadFile } from "@/lib/api";
import { announce } from "@/lib/a11y";
import { useRecorder } from "@/lib/useRecorder";
import { useAskQuestion } from "@/lib/useAskQuestion";
import { getPendingPhoto } from "@/lib/pendingPhoto";
import { useAutoSpeak, useSettings } from "@/lib/settings";
import { useSpeech } from "@/lib/useSpeech";

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AskScreen() {
  const params = useLocalSearchParams<{
    image_id?: string;
    photo_uri?: string;
    question?: string;
  }>();
  const imageId = params.image_id ?? "";
  const photoUri = params.photo_uri ?? getPendingPhoto()?.previewUri ?? getPendingPhoto()?.uri ?? "";
  const [question, setQuestion] = useState(params.question ?? "");
  const [messages, setMessages] = useState<{ question: string; answer: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"transcribing" | "">("");
  const [permissionPrompt, setPermissionPrompt] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(Boolean(photoUri));
  const [speechLoading, setSpeechLoading] = useState(false);
  const askRequest = useAskQuestion(imageId);
  const autoSpeak = useAutoSpeak();
  const { settings } = useSettings();
  const { play: playSpeech, stop: stopSpeech } = useSpeech();
  const speechFile = useRef<File | null>(null);

  const speakAnswer = useCallback(async (text: string) => {
    setSpeechLoading(true);
    try {
      const audio = await synthesize(text, settings.speechLanguage);
      let uri: string;
      if (Platform.OS === "web") {
        uri = URL.createObjectURL(new Blob([audio.bytes], { type: audio.mimeType || "audio/mpeg" }));
      } else {
        const file = new File(Paths.cache, `asksight-chat-${Date.now()}.mp3`);
        file.create({ intermediates: true, overwrite: true });
        await file.write(new Uint8Array(audio.bytes));
        speechFile.current?.delete();
        speechFile.current = file;
        uri = file.uri;
      }
      await playSpeech(uri, settings.speechRate);
    } finally {
      setSpeechLoading(false);
    }
  }, [playSpeech, settings.speechLanguage, settings.speechRate]);

  useEffect(() => () => {
    void stopSpeech();
    if (speechFile.current?.exists) speechFile.current.delete();
  }, [stopSpeech]);

  const addAnswer = useCallback((spokenQuestion: string, answer: string) => {
    setMessages((current) => [...current, { question: spokenQuestion, answer }]);
    setQuestion("");
    if (autoSpeak) {
      void speakAnswer(answer).catch((cause) => {
        setError(toFriendlyMessage(cause, "We couldn't play the spoken answer."));
      });
    }
  }, [autoSpeak, speakAnswer]);

  const processRecording = useCallback(
    async (file: UploadFile) => {
      setError("");
      setBusy("transcribing");
      try {
        const result = await transcribe(file);
        if (!result.transcript.trim()) {
          setError(
            "We couldn't hear a question. Please speak again or type it.",
          );
          return;
        }
        const spokenQuestion = result.transcript.trim();
        setQuestion(spokenQuestion);
        const answer = await askRequest.submit(spokenQuestion);
        if (answer) {
          addAnswer(spokenQuestion, answer.answer);
        }
      } catch (cause) {
        setError(
          toFriendlyMessage(
            cause,
            "We couldn't transcribe that recording. Please try again or type your question.",
          ),
        );
      } finally {
        setBusy("");
      }
    },
    [addAnswer, askRequest],
  );
  const handleAutoStop = useCallback(
    (file: UploadFile | null) => {
      if (file) void processRecording(file);
      announce("Recording stopped after one minute.");
    },
    [processRecording],
  );
  const recorder = useRecorder(handleAutoStop);

  useEffect(() => {
    if (recorder.isRecording)
      announce("Listening. Tap the microphone to stop.");
  }, [recorder.isRecording]);

  async function toggleRecording() {
    setError("");
    if (recorder.isRecording) {
      const file = await recorder.stopRecording();
      if (file) await processRecording(file);
      return;
    }
    if (!recorder.permissionGranted) {
      setPermissionPrompt(true);
      return;
    }
    await recorder.startRecording();
  }

  async function continuePermission() {
    setPermissionPrompt(false);
    const granted = await recorder.requestPermission().catch(() => false);
    setPermissionDenied(!granted);
    if (granted) await recorder.startRecording();
  }

  async function submitQuestion() {
    if (!imageId) {
      setError("Please choose a photo first.");
      return;
    }
    const cleaned = question.trim();
    if (!cleaned) {
      setError("Please enter a question or speak it.");
      return;
    }
    const answer = await askRequest.submit(cleaned);
    if (answer) {
      addAnswer(cleaned, answer.answer);
    }
  }

  const micState =
    busy === "transcribing" || askRequest.loading
      ? "processing"
      : recorder.isRecording
        ? "listening"
        : "idle";

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ProgressAnnouncer
        working={busy === "transcribing" || askRequest.loading}
        startMessage={
          askRequest.loading
            ? "Looking at your photo."
            : "Transcribing your question."
        }
        stillWorkingMessage={
          askRequest.loading
            ? "Still working. This can take up to 30 seconds."
            : "Still transcribing."
        }
        finishMessage={
          busy === "transcribing" ? "Transcription finished." : null
        }
      />
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="h-12 w-12 items-center justify-center rounded-full">
          <MaterialCommunityIcons name="arrow-left" size={28} color="#000000" />
        </Pressable>
        <View className="flex-row items-center gap-2" accessible accessibilityLabel="AskSight">
          <MaterialCommunityIcons name="eye" size={28} color="#000000" importantForAccessibility="no-hide-descendants" />
          <AppText variant="section" className="text-ink">AskSight</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.navigate("/(tabs)/settings")} className="h-12 w-12 items-center justify-center rounded-full">
          <MaterialCommunityIcons name="cog" size={28} color="#000000" />
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow px-6 py-5 pb-4"
      >
        <View className="mx-auto w-full max-w-[560px] gap-5">
          <View className="flex-row items-center gap-4">
            {photoUri ? (
              <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-card bg-field">
                {photoLoading ? <ActivityIndicator color="#000000" /> : null}
                <Image
                  source={{ uri: photoUri }}
                  accessible
                  accessibilityLabel="Photo you are asking about"
                  onLoadStart={() => setPhotoLoading(true)}
                  onLoadEnd={() => setPhotoLoading(false)}
                  onError={() => setPhotoLoading(false)}
                  className="absolute inset-0 h-full w-full"
                />
              </View>
            ) : null}
            <AppText
              variant="hero"
              accessibilityRole="header"
              className="flex-1 text-ink"
            >
              Ask about this photo
            </AppText>
          </View>

          {messages.map((message, index) => (
            <View key={`${index}-${message.question}`} className="gap-3">
              <View className="self-end rounded-card bg-field px-5 py-4">
                <AppText variant="bodyLarge" className="text-ink">{message.question}</AppText>
              </View>
              <View className="self-stretch rounded-card border-2 border-inputBorder bg-white px-5 py-4">
                <AppText variant="answer" className="text-ink">{message.answer}</AppText>
              </View>
            </View>
          ))}

          {!imageId ? (
            <StatusBanner tone="error" message="Please choose a photo first." />
          ) : null}
          {error ? <StatusBanner tone="error" message={error} /> : null}
          {askRequest.error ? (
            <StatusBanner tone="error" message={askRequest.error} />
          ) : null}
          {recorder.error ? (
            <StatusBanner tone="error" message={recorder.error} />
          ) : null}
          {permissionPrompt ? (
            <View className="gap-3 rounded-card border-2 border-inputBorder bg-white p-4">
              <AppText variant="bodyLarge" className="text-ink">
                AskSight uses the microphone to turn your question into text.
                You can review it before sending.
              </AppText>
              <PrimaryButton
                label="Continue"
                onPress={() => void continuePermission()}
              />
              <SecondaryButton
                label="Not now"
                onPress={() => setPermissionPrompt(false)}
              />
            </View>
          ) : null}
          {permissionDenied ? (
            <View className="gap-2">
              <StatusBanner
                tone="warning"
                message="Microphone access is off. You can enable it in device settings, or type your question below."
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => void Linking.openSettings()}
                className="min-h-12 justify-center"
              >
                <AppText variant="bodyLarge" className="font-semibold text-ink">
                  Open Settings
                </AppText>
              </Pressable>
            </View>
          ) : null}

          {askRequest.loading ? (
            <ThinkingPanel
              onCancel={() => {
                askRequest.cancel();
                announce("Stopped waiting. The request may still complete.");
              }}
            />
          ) : null}
          {speechLoading ? (
            <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
              <ActivityIndicator color="#000000" />
              <AppText variant="body" className="text-muted">Preparing spoken answer…</AppText>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <SafeAreaView edges={["bottom"]} className="bg-white px-4 pb-3 pt-3">
        <View className="mx-auto w-full max-w-[560px] flex-row items-center gap-3">
          <MicButton compact state={micState} onPress={() => void toggleRecording()} />
          <TextInput
            accessibilityLabel="Ask a follow-up question"
            accessibilityHint="Type a question about the photo."
            value={question}
            onChangeText={setQuestion}
            maxLength={500}
            placeholder="Ask a follow-up…"
            placeholderTextColor="#404040"
            returnKeyType="send"
            onSubmitEditing={() => void submitQuestion()}
            editable={!askRequest.loading && busy !== "transcribing"}
            className="h-14 min-w-0 flex-1 rounded-field border-2 border-inputBorder bg-white px-4 text-xl text-ink"
          />
          {recorder.isRecording ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop recording" onPress={() => void toggleRecording()} className="h-14 w-14 items-center justify-center rounded-full bg-warning">
              <MaterialCommunityIcons name="stop" size={28} color="#000000" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send question"
              disabled={!question.trim() || !imageId || askRequest.loading || busy === "transcribing"}
              onPress={() => void submitQuestion()}
              className="h-14 w-14 items-center justify-center rounded-full bg-brand disabled:bg-brand-muted"
            >
              <MaterialCommunityIcons name="send" size={26} color="white" />
            </Pressable>
          )}
        </View>
        {recorder.isRecording ? <AppText variant="supporting" accessibilityLiveRegion="polite" className="mt-2 text-center text-ink">Listening · {formatDuration(recorder.durationMillis)}</AppText> : null}
      </SafeAreaView>
    </SafeAreaView>
  );
}
