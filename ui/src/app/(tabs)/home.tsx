import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
                <MaterialCommunityIcons name="eye" size={34} color="#FAF7F0" />
              </View>
              <Text className="text-3xl font-bold tracking-tight text-ink">
                AskSight
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              onPress={() => router.navigate("/(tabs)/settings")}
              className="h-14 w-14 items-center justify-center rounded-full bg-[#F0ECE4]"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="cog" size={30} color="#111111" />
            </Pressable>
          </View>

          <View className="mb-6">
            <Text className="text-[23px] leading-8 text-[#292929]">Hello,</Text>
            <Text
              accessibilityRole="header"
              className="text-[48px] font-bold leading-[54px] tracking-tight text-ink"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {firstName}!
            </Text>
            <Text className="mt-3 max-w-[480px] text-[22px] leading-[30px] text-[#303030]">
              Take a photo and let AskSight describe what you see.
            </Text>
          </View>

          <View
            className="min-h-[255px] overflow-hidden rounded-[30px] bg-ink px-6 py-7"
            accessibilityRole="summary"
            accessibilityLabel="Ask with Camera. Take a photo and get an AI description of your surroundings"
          >
            <View
              className="absolute -bottom-10 -right-10 h-56 w-56 rounded-full border-[18px] border-[#171717]"
              importantForAccessibility="no-hide-descendants"
            />
            <View
              className="absolute -bottom-10 -right-10 h-44 w-44 rounded-full border-[14px] border-[#202020]"
              importantForAccessibility="no-hide-descendants"
            />
            <View className="flex-1 items-center justify-center">
              <View
                className="mb-4 h-[82px] w-[104px] items-center justify-center rounded-[24px] bg-white"
                importantForAccessibility="no-hide-descendants"
              >
                <MaterialCommunityIcons
                  name="camera"
                  size={55}
                  color="#111111"
                />
              </View>
              <Text className="text-center text-[30px] font-bold leading-9 text-white">
                Take a Photo
              </Text>
              <Text className="mt-2 max-w-[330px] text-center text-[18px] leading-[25px] text-[#E1E1E1]">
                Capture your surroundings and get an AI description.
              </Text>
            </View>
          </View>

          <View className="mt-7">
            <View className="flex-row items-center justify-between">
              <Text
                accessibilityRole="header"
                className="text-[25px] font-bold tracking-tight text-ink"
              >
                Recent activity
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate("/(tabs)/history")}
                className="min-h-11 flex-row items-center gap-1 rounded-full border border-[#E6E0D7] px-4"
              >
                <Text className="text-base font-semibold text-ink">
                  See all
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={23}
                  color="#111111"
                  importantForAccessibility="no-hide-descendants"
                />
              </Pressable>
            </View>

            <View className="mt-3 min-h-[112px] flex-row items-center gap-4 rounded-[22px] bg-white/70 px-5 py-5">
              <View
                className="h-14 w-14 items-center justify-center rounded-full bg-[#F0ECE4]"
                importantForAccessibility="no-hide-descendants"
              >
                <MaterialCommunityIcons
                  name="history"
                  size={28}
                  color="#111111"
                />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-ink">
                  No questions yet
                </Text>
                <Text className="mt-1 text-base leading-6 text-[#666666]">
                  Your past questions will appear here.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
