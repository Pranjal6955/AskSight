import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image, Pressable, View } from "react-native";

import { AppText } from "./AppText";

type Props = {
  question: string;
  answer: string;
  isPlaying: boolean;
  onPlaybackPress: () => void;
  photoUri?: string;
  clarification?: boolean;
};

export function AnswerBlock({
  question,
  answer,
  isPlaying,
  onPlaybackPress,
  photoUri,
  clarification = false,
}: Props) {
  return (
    <View className="gap-4">
      <AppText variant="supporting" className="text-muted">
        You asked: {question}
      </AppText>
      <AppText variant="answer" className="text-ink">
        {answer}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Stop speaking" : "Listen Again"}
        accessibilityState={{ selected: isPlaying }}
        onPress={onPlaybackPress}
        className="min-h-14 flex-row items-center justify-center gap-3 rounded-field bg-brand px-5 py-3"
      >
        <MaterialCommunityIcons
          name={isPlaying ? "stop" : "volume-high"}
          size={24}
          color="#FFFFFF"
          importantForAccessibility="no-hide-descendants"
        />
        <AppText variant="bodyLarge" className="font-bold text-white">
          {isPlaying ? "Stop" : "Listen Again"}
        </AppText>
      </Pressable>
      <AppText
        variant="body"
        accessibilityLiveRegion="polite"
        className="text-muted"
      >
        {isPlaying ? "Speaking…" : "Stopped"}
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
