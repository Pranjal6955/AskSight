import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { focus, announce } from "@/lib/a11y";
import { useSettings } from "@/lib/settings";

const DETAILS = [
  "Your photos, questions, and answers are stored in your account until you delete them.",
  "Generated speech is temporary and is not stored as history.",
  "When you use voice, your recorded audio is sent to Sarvam to transcribe your question. Answer text is sent to Sarvam to create spoken audio.",
];

export default function ConsentScreen() {
  const { update } = useSettings();
  const [readMore, setReadMore] = useState(false);
  const titleRef = useRef<View>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (titleRef.current) focus(titleRef.current);
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  function accept() {
    update("consentGiven", true);
    announce("Privacy information acknowledged. Opening AskSight.");
    router.replace("/(tabs)/home");
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-7">
        <View className="mx-auto w-full max-w-[560px] gap-5">
          <View ref={titleRef} accessible accessibilityRole="header">
            <AppText variant="hero" className="text-ink">
              Before you start
            </AppText>
          </View>
          <AppText variant="bodyLarge" className="text-muted">
            Here is how AskSight handles your photos and voice questions.
          </AppText>
          <View accessibilityRole="list" className="gap-4">
            {DETAILS.slice(0, readMore ? DETAILS.length : 2).map((detail) => (
              <View key={detail} className="flex-row items-start gap-3">
                <AppText
                  variant="bodyLarge"
                  importantForAccessibility="no-hide-descendants"
                  className="font-bold text-ink"
                >
                  •
                </AppText>
                <AppText
                  accessibilityRole="text"
                  variant="bodyLarge"
                  className="flex-1 text-ink"
                >
                  {detail}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="bodyLarge" className="text-ink">
            Answers can be wrong. Please verify important information.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: readMore }}
            onPress={() => {
              setReadMore((current) => !current);
              announce(
                readMore
                  ? "Showing the short privacy summary."
                  : "Showing more privacy information.",
              );
            }}
            className="min-h-12 justify-center"
          >
            <AppText
              variant="bodyLarge"
              className="font-semibold text-brand-link"
            >
              {readMore ? "Show Less" : "Read More"}
            </AppText>
          </Pressable>
          <PrimaryButton label="I Understand" onPress={accept} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
