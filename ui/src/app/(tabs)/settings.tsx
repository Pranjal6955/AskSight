import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Blobs } from "@/components/Blobs";
import { useAuth } from "@/lib/auth";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <Blobs />
      <View className="flex-1 px-6 pt-6">
        <Text
          className="text-4xl font-bold text-ink"
          accessibilityRole="header"
        >
          Settings
        </Text>

        {user ? (
          <View
            className="touch-target mt-8 rounded-card bg-card-grey p-4"
            accessibilityLabel={`Signed in as ${user.name}`}
          >
            <Text className="text-base font-bold text-ink">{user.name}</Text>
            <Text className="mt-1 text-sm text-muted">{user.email}</Text>
          </View>
        ) : (
          <View
            className="touch-target mt-8 items-center justify-center rounded-card bg-field p-6"
            accessibilityLabel="Not signed in"
          >
            <Text className="text-center text-base text-muted">
              Sign in to manage your account
            </Text>
          </View>
        )}

        <View className="mt-8 gap-4" accessibilityLabel="Account actions">
          <Pressable
            accessibilityRole="button"
            onPress={signOut}
            className="touch-target focus-visible:outline-3 flex-row items-center gap-3 rounded-field bg-field px-6 py-4 focus-visible:outline focus-visible:outline-focus active:opacity-70"
            hitSlop={8}
            accessibilityLabel="Sign out of your account"
          >
            <MaterialCommunityIcons
              name="logout"
              size={22}
              color="#B33F01"
              accessibilityHidden={true}
            />
            <Text className="text-base font-semibold text-error">Sign out</Text>
          </Pressable>

          <View
            className="border-field-border touch-target flex-row items-center gap-3 rounded-field border bg-field px-6 py-4 opacity-60"
            accessibilityLabel="Delete account - not yet available"
          >
            <MaterialCommunityIcons
              name="account-remove-outline"
              size={22}
              color="#5C6168"
              accessibilityHidden={true}
            />
            <Text className="text-base font-semibold text-muted">
              Delete account
            </Text>
          </View>
        </View>

        <View className="mt-12 gap-4" accessibilityLabel="App information">
          <Text
            className="text-lg font-semibold text-ink"
            accessibilityRole="header"
          >
            About
          </Text>
          <View className="touch-target rounded-card bg-field p-4">
            <Text className="text-sm text-muted">
              AskSight helps blind and low-vision users understand their
              surroundings through AI-powered image descriptions, voice
              questions, and text input.
            </Text>
          </View>
          <View className="mt-4 flex-row gap-4">
            <Text
              accessibilityRole="link"
              accessibilityLabel="Privacy policy - not yet available"
              className="text-sm font-medium text-brand-link underline opacity-60"
            >
              Privacy policy
            </Text>
            <Text
              accessibilityRole="link"
              accessibilityLabel="Terms of service - not yet available"
              className="text-sm font-medium text-brand-link underline opacity-60"
            >
              Terms of service
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}