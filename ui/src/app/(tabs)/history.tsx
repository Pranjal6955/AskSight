import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HistoryScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 32,
        }}
      >
        <View className="mx-auto w-full max-w-[560px]">
          <Text
            className="text-4xl font-bold leading-10 text-ink"
            accessibilityRole="header"
          >
            History
          </Text>
          <Text className="mt-3 text-xl leading-7 text-muted">
            Return to questions you have asked.
          </Text>

          <View className="mt-8 items-center rounded-card border-2 border-inputBorder bg-white px-6 py-10">
            <View
              className="h-20 w-20 items-center justify-center rounded-full bg-card-green"
              importantForAccessibility="no-hide-descendants"
            >
              <MaterialCommunityIcons
                name="history"
                size={40}
                color="#000000"
              />
            </View>
            <Text className="mt-6 text-center text-2xl font-bold text-ink">
              No questions yet
            </Text>
            <Text className="mt-3 text-center text-lg leading-7 text-muted">
              Your past questions will appear here.
            </Text>
            <Text className="mt-2 text-center text-base leading-6 text-muted">
              Your question history will be available when saved sessions are
              supported.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate("/(tabs)/home")}
              className="touch-target mt-7 w-full flex-row items-center justify-center rounded-field bg-brand px-6 py-4"
            >
              <Text className="text-2xl font-bold text-white">
                Ask your first question
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
