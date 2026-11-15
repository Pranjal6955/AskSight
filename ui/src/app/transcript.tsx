import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusBanner } from "@/components/StatusBanner";
import { ProgressAnnouncer } from "@/components/ProgressAnnouncer";
import { ThinkingPanel } from "@/components/ThinkingPanel";
import { announce, focus } from "@/lib/a11y";
import { useAskQuestion } from "@/lib/useAskQuestion";

export default function TranscriptScreen() {
  const params = useLocalSearchParams<{
    image_id?: string;
    photo_uri?: string;
    transcript?: string;
  }>();
  const [transcript, setTranscript] = useState(params.transcript ?? "");
  const primaryRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const askRequest = useAskQuestion(params.image_id ?? "");

  useEffect(() => {
    if (!params.transcript?.trim()) return;
    announce(`We heard: ${params.transcript}`);
    announce("Review and edit your question before sending it.");
    const timer = setTimeout(() => {
      if (primaryRef.current) focus(primaryRef.current);
    }, 250);
    return () => clearTimeout(timer);
  }, [params.transcript]);

  async function continueToAsk() {
    if (!transcript.trim() || !params.image_id || askRequest.loading) return;
    const result = await askRequest.submit(transcript.trim());
    if (result) {
      router.replace({
        pathname: "/answer",
        params: {
          image_id: params.image_id,
          photo_uri: params.photo_uri ?? "",
          question: transcript.trim(),
          ...result,
          history_error: result.historyError,
        },
      } as never);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ProgressAnnouncer
        working={askRequest.loading}
        startMessage="Looking at your photo."
        stillWorkingMessage="Still looking at your photo."
        finishMessage={null}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow justify-center px-6 py-6"
      >
        <View className="mx-auto w-full max-w-[560px] gap-5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to question entry"
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
              Did we hear you right?
            </AppText>
          </View>
          {!params.image_id ? (
            <StatusBanner tone="error" message="Please choose a photo first." />
          ) : null}
          {askRequest.error ? (
            <StatusBanner tone="error" message={askRequest.error} />
          ) : null}
          <AppText variant="bodyLarge" className="text-muted">
            Review your question. You can edit it before sending.
          </AppText>
          <TextInput
            ref={inputRef}
            accessibilityLabel="Edit your question"
            value={transcript}
            onChangeText={setTranscript}
            multiline
            maxLength={500}
            textAlignVertical="top"
            className="min-h-36 rounded-card border-2 border-inputBorder bg-white p-5 text-2xl leading-9 text-ink"
          />
          <AppText variant="supporting" className="text-muted">
            {transcript.length} of 500 characters
          </AppText>
          {askRequest.loading ? (
            <ThinkingPanel
              onCancel={() => {
                askRequest.cancel();
                announce("Stopped waiting. The request may still complete.");
                router.replace({
                  pathname: "/ask",
                  params: {
                    image_id: params.image_id ?? "",
                    photo_uri: params.photo_uri ?? "",
                    question: transcript,
                  },
                } as never);
              }}
            />
          ) : (
            <View ref={primaryRef} collapsable={false}>
              <PrimaryButton
                label={askRequest.error ? "Try Again" : "Ask This Question"}
                disabled={!transcript.trim() || !params.image_id}
                onPress={() => void continueToAsk()}
              />
            </View>
          )}
          {!askRequest.loading ? (
            <SecondaryButton
              label="Speak Again"
              onPress={() =>
                router.replace({
                  pathname: "/ask",
                  params: {
                    image_id: params.image_id ?? "",
                    photo_uri: params.photo_uri ?? "",
                  },
                } as never)
              }
            />
          ) : null}
          <SecondaryButton
            label="Edit"
            onPress={() => inputRef.current?.focus()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
