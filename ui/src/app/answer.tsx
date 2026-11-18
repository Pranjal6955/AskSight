import { File, Paths } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnswerBlock } from "@/components/AnswerBlock";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProgressAnnouncer } from "@/components/ProgressAnnouncer";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusBanner } from "@/components/StatusBanner";
import { announce, focus } from "@/lib/a11y";
import { synthesize, toFriendlyMessage } from "@/lib/api";
import { useAutoSpeak, useSettings } from "@/lib/settings";
import { useSpeech } from "@/lib/useSpeech";

const CLARIFICATION_START = "sorry, i could not find a clear answer";

function isClarification(answer: string) {
  return answer.trim().toLocaleLowerCase().startsWith(CLARIFICATION_START);
}

export default function AnswerScreen() {
  const params = useLocalSearchParams<{
    image_id?: string;
    photo_uri?: string;
    question?: string;
    answer?: string;
    entry_id?: string;
    model_version?: string;
    history_error?: string;
  }>();
  const answer =
    params.answer ?? "We couldn't find an answer for that question.";
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState("");
  const shouldAutoSpeak = useAutoSpeak();
  const { settings, update } = useSettings();
  const {
    play: playSpeech,
    stop: stopSpeech,
    isPlaying,
    didJustFinish,
  } = useSpeech();
  const answerRef = useRef<View>(null);
  const audioUri = useRef<string | null>(null);
  const cacheFile = useRef<File | null>(null);
  const objectUrl = useRef<string | null>(null);
  const ttsController = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const autoStarted = useRef(false);
  const finishAnnounced = useRef(false);
  const clarification = isClarification(answer);

  useEffect(() => {
    if (params.model_version) update("lastModelVersion", params.model_version);
  }, [params.model_version, update]);

  const prepareAudio = useCallback(async () => {
    setTtsError("");
    setTtsLoading(true);
    const controller = new AbortController();
    ttsController.current = controller;
    try {
      const audio = await synthesize(
        answer,
        settings.speechLanguage,
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted || !alive.current) return null;
      let uri: string;
      if (Platform.OS === "web") {
        const blob = new Blob([audio.bytes], {
          type: audio.mimeType || "audio/mpeg",
        });
        objectUrl.current = URL.createObjectURL(blob);
        uri = objectUrl.current;
      } else {
        const file = new File(
          Paths.cache,
          `asksight-answer-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
        );
        file.create({ intermediates: true });
        try {
          await file.write(new Uint8Array(audio.bytes));
        } catch (cause) {
          if (file.exists) file.delete();
          throw cause;
        }
        cacheFile.current = file;
        uri = file.uri;
      }
      audioUri.current = uri;
      return uri;
    } catch (cause) {
      if (controller.signal.aborted || !alive.current) return null;
      const message = toFriendlyMessage(
        cause,
        "We couldn't prepare the spoken answer. The answer is still on screen.",
      );
      setTtsError(message);
      announce(message);
      return null;
    } finally {
      if (ttsController.current === controller) ttsController.current = null;
      if (alive.current) setTtsLoading(false);
    }
  }, [answer, settings.speechLanguage]);

  const playAnswer = useCallback(
    async (automatic = false) => {
      setTtsError("");
      try {
        let uri = audioUri.current;
        if (!uri) uri = await prepareAudio();
        if (!uri) return;
        if (automatic) announce("Answer ready.");
        await playSpeech(uri, settings.speechRate);
        finishAnnounced.current = false;
      } catch (cause) {
        const message = toFriendlyMessage(
          cause,
          "We couldn't play the spoken answer. The answer is still on screen.",
        );
        setTtsError(message);
        announce(message);
      }
    },
    [playSpeech, prepareAudio, settings.speechRate],
  );

  const stopAnswer = useCallback(() => {
    void stopSpeech();
  }, [stopSpeech]);

  useEffect(() => {
    if (!shouldAutoSpeak || autoStarted.current || !answer) return;
    autoStarted.current = true;
    void playAnswer(true);
  }, [answer, playAnswer, shouldAutoSpeak]);

  useEffect(() => {
    if (!didJustFinish || finishAnnounced.current) return;
    finishAnnounced.current = true;
    announce("Stopped.");
  }, [didJustFinish]);

  useEffect(() => {
    if (answerRef.current) focus(answerRef.current);
    if (!shouldAutoSpeak) announce("Answer ready.");
  }, [shouldAutoSpeak]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ttsController.current?.abort();
      ttsController.current = null;
      void stopSpeech();
      if (cacheFile.current?.exists) cacheFile.current.delete();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [stopSpeech]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ProgressAnnouncer
        working={ttsLoading}
        startMessage="Preparing the spoken answer."
        stillWorkingMessage="Still preparing the spoken answer."
        finishMessage={
          ttsError ? "The answer is still on screen." : "Audio ready."
        }
      />
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-6">
        <View className="mx-auto w-full max-w-[560px] gap-5">
          <AppText
            variant="hero"
            accessibilityRole="header"
            className="text-ink"
          >
            Your answer
          </AppText>
          {params.history_error ? (
            <View className="gap-2">
              <StatusBanner tone="error" message={params.history_error} />
              <AppText variant="bodyLarge" className="text-muted">
                You can still read and hear this answer.
              </AppText>
            </View>
          ) : null}
          {ttsError ? (
            <View className="gap-2">
              <StatusBanner tone="error" message={ttsError} />
              <AppText variant="bodyLarge" className="text-muted">
                The answer is still shown above. You can read it or try Listen
                Again.
              </AppText>
            </View>
          ) : null}
          <View ref={answerRef} collapsable={false}>
            <AnswerBlock
              question={params.question ?? "Your question"}
              answer={answer}
              onPlaybackPress={() => {
                if (isPlaying) stopAnswer();
                else void playAnswer();
              }}
              isPlaying={isPlaying}
              isLoadingAudio={ttsLoading}
              clarification={clarification}
              photoUri={params.photo_uri}
            />
          </View>
          {__DEV__ && params.model_version === "mock-0.0.0" ? (
            <AppText
              variant="supporting"
              className="rounded-field bg-warning p-3 text-ink"
            >
              Demo mode — not a real model.
            </AppText>
          ) : null}
          {clarification ? (
            <PrimaryButton
              label="Ask Another Question"
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
          ) : (
            <SecondaryButton
              label="Ask Another Question"
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
          )}
          <SecondaryButton
            label="New Photo"
            onPress={() => router.replace("/(tabs)/home")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
