import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const initials = user?.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function handleSignOut() {
    signOut();
    router.replace("/login");
  }

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
            Settings
          </Text>
          <Text className="mt-3 text-xl leading-7 text-muted">
            Manage your AskSight account.
          </Text>

          <Text
            className="mb-3 mt-8 text-2xl font-bold text-ink"
            accessibilityRole="header"
          >
            Your account
          </Text>
          {user ? (
            <View
              className="flex-row items-center gap-4 rounded-card border-2 border-inputBorder bg-white p-5"
              accessibilityLabel={`Signed in as ${user.name}, ${user.email}`}
            >
              <View className="h-16 w-16 items-center justify-center rounded-full bg-card-green">
                <Text className="text-xl font-bold text-brand">{initials}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-ink">{user.name}</Text>
                <Text className="mt-1 text-lg leading-6 text-muted">
                  {user.email}
                </Text>
              </View>
            </View>
          ) : (
            <View className="rounded-card border-2 border-inputBorder bg-white p-5">
              <Text className="text-lg leading-7 text-muted">
                Sign in to manage your account.
              </Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out of your account"
            accessibilityHint="Returns to the sign in screen"
            accessibilityState={{ disabled: !user }}
            disabled={!user}
            onPress={handleSignOut}
            className={`touch-target mt-5 flex-row items-center justify-center gap-3 rounded-field border-2 bg-white px-6 py-4 ${
              user ? "border-error active:bg-card-orange" : "border-inputBorder"
            }`}
          >
            <MaterialCommunityIcons
              name="logout"
              size={26}
              color={user ? "#B42318" : "#404040"}
              importantForAccessibility="no-hide-descendants"
            />
            <Text
              className={`text-xl font-bold ${user ? "text-error" : "text-muted"}`}
            >
              Sign out
            </Text>
          </Pressable>

          <Text
            className="mb-3 mt-10 text-2xl font-bold text-ink"
            accessibilityRole="header"
          >
            About AskSight
          </Text>
          <View className="flex-row items-start gap-4 rounded-card border-2 border-inputBorder bg-white p-5">
            <MaterialCommunityIcons
              name="eye-outline"
              size={30}
              color="#000000"
              importantForAccessibility="no-hide-descendants"
            />
            <Text className="flex-1 text-lg leading-7 text-muted">
              AskSight helps blind and low-vision users understand their
              surroundings through image descriptions and questions.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
