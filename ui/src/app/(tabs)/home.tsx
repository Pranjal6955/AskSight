import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <View className="flex-1 px-6 pb-28 pt-5">
        <View className="mx-auto w-full max-w-[560px] flex-row items-center justify-between">
          <View className="flex-row items-center gap-3" accessible accessibilityLabel="AskSight">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-brand" importantForAccessibility="no-hide-descendants">
              <MaterialCommunityIcons name="eye" size={30} color="white" />
            </View>
            <AppText variant="section" className="text-ink">AskSight</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.navigate("/(tabs)/settings")}
            className="h-14 w-14 items-center justify-center rounded-full bg-field"
          >
            <MaterialCommunityIcons name="cog" size={30} color="#000000" />
          </Pressable>
        </View>

        <View className="mx-auto mt-6 w-full max-w-[560px] flex-1 items-center justify-center gap-8">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open camera"
            accessibilityHint="Opens the camera to take a photo."
            onPress={() => router.push("/capture" as never)}
            className="h-64 w-64 items-center justify-center rounded-full bg-brand"
          >
            <View className="h-52 w-52 items-center justify-center rounded-full border-2 border-white/70">
              <MaterialCommunityIcons name="camera-outline" size={112} color="white" importantForAccessibility="no-hide-descendants" />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo"
            onPress={() => router.push("/capture?pick=1" as never)}
            className="min-h-20 w-full flex-row items-center justify-center gap-4 rounded-card bg-brand px-6 py-4"
          >
            <MaterialCommunityIcons name="image-multiple-outline" size={30} color="white" importantForAccessibility="no-hide-descendants" />
            <AppText variant="bodyLarge" className="font-bold text-white">Choose a photo</AppText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
