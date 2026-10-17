import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

export default function HomeScreen() {
  const { user } = useAuth();
  const initials = user?.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 32,
        }}
      >
        <View className="mx-auto w-full max-w-[560px]">
          <View className="mb-8 flex-row items-center justify-between">
            <Text className="text-3xl font-bold text-brand">AskSight</Text>
            {initials ? (
              <View
                accessible
                className="h-14 w-14 items-center justify-center rounded-full border-2 border-brand bg-card-green"
                accessibilityLabel={`Signed in as ${user?.name}`}
              >
                <Text className="text-xl font-bold text-brand">{initials}</Text>
              </View>
            ) : null}
          </View>

          <View
            className="min-h-[132px] flex-row items-center gap-4 rounded-card border-2 border-brand bg-brand p-5"
            accessibilityLabel="Ask with Camera. Take a photo and get an AI description of your surroundings"
          >
            <View
              className="h-14 w-14 items-center justify-center rounded-full bg-brand-deep"
              importantForAccessibility="no-hide-descendants"
            >
              <MaterialCommunityIcons
                name="camera-outline"
                size={30}
                color="#FFFFFF"
              />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-bold leading-8 text-white">
                Ask with Camera
              </Text>
              <Text className="mt-2 text-lg leading-7 text-white">
                Take a photo and get an AI description of your surroundings
              </Text>
            </View>
          </View>

          <View className="mt-10">
            <View className="flex-row items-center justify-between">
              <Text
                accessibilityRole="header"
                className="text-2xl font-bold text-ink"
              >
                Recent history
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate("/(tabs)/history")}
                className="touch-target justify-center rounded-field px-3"
              >
                <Text className="text-lg font-bold text-brand-link">
                  See all
                </Text>
              </Pressable>
            </View>

            <View className="mt-4 items-center rounded-card border-2 border-inputBorder bg-white px-6 py-8">
              <View
                className="h-16 w-16 items-center justify-center rounded-full bg-card-green"
                importantForAccessibility="no-hide-descendants"
              >
                <MaterialCommunityIcons
                  name="history"
                  size={32}
                  color="#000000"
                />
              </View>
              <Text className="mt-5 text-2xl font-bold text-ink">
                No questions yet
              </Text>
              <Text className="mt-2 text-center text-lg leading-7 text-muted">
                Your past questions will appear here.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
