import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnswerBlock } from "@/components/AnswerBlock";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

export default function AnswerScreen() {
  const params = useLocalSearchParams<{
    image_id?: string;
    photo_uri?: string;
    question?: string;
    answer?: string;
    entry_id?: string;
    model_version?: string;
  }>();
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-6">
        <View className="mx-auto w-full max-w-[560px] gap-5">
          <View className="flex-row items-center gap-4">
            <AppText
              variant="hero"
              accessibilityRole="header"
              className="flex-1 text-ink"
            >
              Your answer
            </AppText>
          </View>
          <AnswerBlock
            question={params.question ?? "Your question"}
            answer={
              params.answer ?? "We couldn't find an answer for that question."
            }
            onPlaybackPress={() => {}}
            isPlaying={false}
            photoUri={params.photo_uri}
          />
          {__DEV__ && params.model_version === "mock-0.0.0" ? (
            <AppText variant="supporting" className="text-muted">
              Demo mode — not a real model.
            </AppText>
          ) : null}
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
          <SecondaryButton
            label="New Photo"
            onPress={() => router.replace("/(tabs)/home")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
