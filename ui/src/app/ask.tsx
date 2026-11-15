import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
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
import { ask, toFriendlyMessage, transcribe, type UploadFile } from "@/lib/api";
import { announce } from "@/lib/a11y";
import { useRecorder } from "@/lib/useRecorder";

const EXAMPLES = [
  "What does this say?",
  "What colour is this?",
  "Is this safe to eat?",
];

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AskScreen() {
  const params = useLocalSearchParams<{
    image_id?: string;
    photo_uri?: string;
  }>();
  const imageId = params.image_id ?? "";
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"transcribing" | "asking" | "">("");
  const [permissionPrompt, setPermissionPrompt] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

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
        router.push({
          pathname: "/transcript",
          params: {
            image_id: imageId,
            photo_uri: params.photo_uri ?? "",
            transcript: result.transcript,
          },
        } as never);
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
    [imageId, params.photo_uri],
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
    setError("");
    setBusy("asking");
    try {
      const answer = await ask(imageId, cleaned);
      router.replace({
        pathname: "/answer",
        params: {
          image_id: imageId,
          photo_uri: params.photo_uri ?? "",
          question: cleaned,
          ...answer,
        },
      } as never);
    } catch (cause) {
      setError(
        toFriendlyMessage(
          cause,
          "We couldn't answer that question. Please try again.",
        ),
      );
    } finally {
      setBusy("");
    }
  }

  const micState =
    busy === "transcribing"
      ? "processing"
      : recorder.isRecording
        ? "listening"
        : "idle";

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ProgressAnnouncer
        working={busy === "transcribing" || busy === "asking"}
        startMessage={
          busy === "asking"
            ? "Looking at your photo."
            : "Transcribing your question."
        }
        stillWorkingMessage={
          busy === "asking"
            ? "Still looking at your photo."
            : "Still transcribing."
        }
        finishMessage={
          busy === "asking" ? "Answer ready." : "Transcription finished."
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow justify-center px-6 py-5"
      >
        <View className="mx-auto w-full max-w-[560px] gap-5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            className="h-12 w-12 items-center justify-center rounded-full border-2 border-inputBorder bg-white"
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={25}
              color="#000000"
            />
          </Pressable>
          <View className="flex-row items-center gap-4">
            {params.photo_uri ? (
              <Image
                source={{ uri: params.photo_uri }}
                accessible
                accessibilityLabel="Photo you are asking about"
                className="h-20 w-20 rounded-card bg-field"
              />
            ) : null}
            <AppText
              variant="hero"
              accessibilityRole="header"
              className="flex-1 text-ink"
            >
              Ask about this photo
            </AppText>
          </View>

          {!imageId ? (
            <StatusBanner tone="error" message="Please choose a photo first." />
          ) : null}
          {error ? <StatusBanner tone="error" message={error} /> : null}
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

          <View className="items-center gap-2 py-2">
            <MicButton
              state={micState}
              onPress={() => void toggleRecording()}
            />
            {recorder.isRecording ? (
              <AppText
                variant="bodyLarge"
                accessibilityLiveRegion="polite"
                className="font-semibold text-ink"
              >
                Listening · {formatDuration(recorder.durationMillis)} of 1:00
              </AppText>
            ) : null}
            {recorder.isRecording ? (
              <SecondaryButton
                label="Cancel recording"
                onPress={() => void recorder.cancelRecording()}
              />
            ) : null}
          </View>

          <View className="gap-2">
            <AppText variant="bodyLarge" className="font-semibold text-ink">
              Or type your question
            </AppText>
            <TextInput
              accessibilityLabel="Your question"
              accessibilityHint="Enter up to 500 characters about the photo."
              value={question}
              onChangeText={setQuestion}
              multiline
              maxLength={500}
              placeholder="Type a question about this photo"
              placeholderTextColor="#404040"
              textAlignVertical="top"
              className="min-h-28 rounded-field border-2 border-inputBorder bg-input px-4 py-3 text-xl text-ink"
            />
            <AppText variant="supporting" className="text-muted">
              {question.length} of 500 characters
            </AppText>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                accessibilityLabel={`Fill question: ${example}`}
                onPress={() => setQuestion(example)}
                className="min-h-12 justify-center rounded-full border-2 border-inputBorder bg-white px-4"
              >
                <AppText variant="body" className="font-semibold text-ink">
                  {example}
                </AppText>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            label="Ask"
            loading={busy === "asking"}
            loadingLabel="Looking at your photo…"
            disabled={
              !imageId || recorder.isRecording || busy === "transcribing"
            }
            onPress={() => void submitQuestion()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
