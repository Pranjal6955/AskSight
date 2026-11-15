import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionCard } from "@/components/ActionCard";
import { AppText } from "@/components/AppText";
import { useAuth } from "@/lib/auth";

export default function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0] || "there";

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 18,
          paddingBottom: 112,
        }}
      >
        <View className="mx-auto w-full max-w-[560px]">
          <View className="mb-7 flex-row items-center justify-between">
            <View
              className="flex-row items-center gap-3"
              accessible
              accessibilityLabel="AskSight"
            >
              <View
                className="h-14 w-14 items-center justify-center rounded-full bg-ink"
                importantForAccessibility="no-hide-descendants"
              >
                <MaterialCommunityIcons name="eye" size={34} color="white" />
              </View>
              <AppText variant="section" className="text-ink">
                AskSight
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              onPress={() => router.navigate("/(tabs)/settings")}
              className="h-14 w-14 items-center justify-center rounded-full bg-field"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="cog" size={30} color="#000000" />
            </Pressable>
          </View>

          <View className="mb-6">
            <AppText variant="bodyLarge" className="text-muted">
              Hello,
            </AppText>
            <AppText
              variant="hero"
              accessibilityRole="header"
              className="text-ink"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {firstName}!
            </AppText>
            <AppText
              variant="bodyLarge"
              className="mt-3 max-w-[480px] text-muted"
            >
              Take a photo and let AskSight describe what you see.
            </AppText>
          </View>

          <ActionCard
            title="Take a Photo"
            description="Capture your surroundings and get an AI description."
            icon="camera"
            variant="hero"
            accessibilityLabel="Take a photo. Opens the camera."
            accessibilityHint="You can also choose a photo from your library."
            onPress={() => router.push("/capture" as never)}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo from your library"
            onPress={() => router.push("/photo-preview?pick=1" as never)}
            className="mt-3 min-h-14 flex-row items-center justify-center gap-3 rounded-field border-2 border-inputBorder bg-white px-5 py-3"
          >
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={24}
              color="#000000"
              importantForAccessibility="no-hide-descendants"
            />
            <AppText variant="bodyLarge" className="font-semibold text-ink">
              Choose from Library
            </AppText>
          </Pressable>

          <View className="mt-7">
            <View className="flex-row items-center justify-between">
              <AppText
                variant="section"
                accessibilityRole="header"
                className="text-ink"
              >
                Recent activity
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate("/(tabs)/history")}
                className="min-h-11 flex-row items-center gap-1 rounded-full border-2 border-inputBorder px-4"
              >
                <AppText variant="body" className="font-semibold text-ink">
                  See all
                </AppText>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={23}
                  color="#000000"
                  importantForAccessibility="no-hide-descendants"
                />
              </Pressable>
            </View>

            <View className="mt-3 min-h-[112px] flex-row items-center gap-4 rounded-card bg-white px-5 py-5">
              <View
                className="h-14 w-14 items-center justify-center rounded-full bg-field"
                importantForAccessibility="no-hide-descendants"
              >
                <MaterialCommunityIcons
                  name="history"
                  size={28}
                  color="#000000"
                />
              </View>
              <View className="flex-1">
                <AppText variant="bodyLarge" className="font-bold text-ink">
                  No questions yet
                </AppText>
                <AppText variant="body" className="mt-1 text-muted">
                  Your past questions will appear here.
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ask your first question"
                  onPress={() => router.push("/capture" as never)}
                  className="mt-2 min-h-11 justify-center"
                >
                  <AppText variant="body" className="font-semibold text-ink">
                    Ask your first question
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
