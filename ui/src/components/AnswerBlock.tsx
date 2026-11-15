import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ActivityIndicator, Image, Pressable, View } from "react-native";

import { useTextScale } from "@/lib/settings";

import { AppText } from "./AppText";

type Props = {
  question: string;
  answer: string;
  isPlaying: boolean;
  onPlaybackPress: () => void;
  photoUri?: string;
  clarification?: boolean;
  isLoadingAudio?: boolean;
};

export function AnswerBlock({
  question,
  answer,
  isPlaying,
  onPlaybackPress,
  photoUri,
  clarification = false,
  isLoadingAudio = false,
}: Props) {
  const scale = useTextScale();
  return (
    <View className="gap-4">
      <AppText variant="body" className="text-muted">
        You asked: {question}
      </AppText>
      <AppText
        variant="answer"
        style={{
          fontSize: 32 * scale,
          lineHeight: 40 * scale,
          fontWeight: "600",
        }}
        className="text-ink"
      >
        {answer}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isLoadingAudio
            ? "Preparing spoken answer"
            : isPlaying
              ? "Stop speaking"
              : "Listen Again"
        }
        accessibilityState={{
          selected: isPlaying,
          busy: isLoadingAudio,
          disabled: isLoadingAudio,
        }}
        disabled={isLoadingAudio}
        onPress={onPlaybackPress}
        className={`min-h-14 flex-row items-center justify-center gap-3 rounded-field px-5 py-3 ${clarification ? "border-2 border-brand bg-canvas" : "bg-brand"}`}
      >
        {isLoadingAudio ? (
          <ActivityIndicator
            color="#000000"
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
        <MaterialCommunityIcons
          name={isLoadingAudio ? "loading" : isPlaying ? "stop" : "volume-high"}
          size={24}
          color={clarification ? "#000000" : "#FFFFFF"}
          importantForAccessibility="no-hide-descendants"
        />
        <AppText
          variant="bodyLarge"
          className={`font-bold ${clarification ? "text-brand-link" : "text-white"}`}
        >
          {isLoadingAudio
            ? "Preparing audio…"
            : isPlaying
              ? "Stop"
              : "Listen Again"}
        </AppText>
      </Pressable>
      <AppText
        variant="body"
        accessibilityLiveRegion="polite"
        className="text-muted"
      >
        {isPlaying
          ? "Speaking…"
          : isLoadingAudio
            ? "Preparing audio…"
            : "Stopped"}
      </AppText>
      <AppText variant="body" className="text-muted">
        Answers can be wrong, especially in low light or when the photo is
        blurry. Please verify important information.
      </AppText>
      {clarification ? (
        <AppText variant="bodyLarge" className="font-semibold text-ink">
          Ask another question to clarify.
        </AppText>
      ) : null}
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          accessible
          accessibilityLabel="Photo you asked about"
          resizeMode="cover"
          className="h-24 w-24 rounded-card"
        />
      ) : null}
    </View>
  );
}
