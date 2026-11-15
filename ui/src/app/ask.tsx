import { router, useLocalSearchParams } from "expo-router";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";

// Phase 2 will replace this handoff with typed and spoken question entry.
export default function AskScreen() {
  const { image_id } = useLocalSearchParams<{ image_id?: string }>();
  return (
    <SafeAreaView
      className="flex-1 justify-center bg-canvas px-6"
      edges={["top", "bottom"]}
    >
      <View className="mx-auto w-full max-w-[480px]">
        <AppText
          variant="hero"
          accessibilityRole="header"
          className="mb-3 text-ink"
        >
          Photo ready
        </AppText>
        <AppText variant="bodyLarge" className="mb-7 text-muted">
          {image_id
            ? "Your photo is ready for a question. Question entry is coming in the next step."
            : "We couldn't find your photo. Please choose a photo again."}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(tabs)/home")}
          className="min-h-14 items-center justify-center rounded-field bg-brand"
        >
          <AppText variant="bodyLarge" className="font-bold text-white">
            Back to Home
          </AppText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
