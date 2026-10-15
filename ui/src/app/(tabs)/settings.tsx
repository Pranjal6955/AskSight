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
        <Text className="text-4xl font-bold text-ink">Settings</Text>

        {user ? (
          <View className="mt-8 rounded-card bg-card-grey p-4">
            <Text className="text-base font-bold text-ink">{user.name}</Text>
            <Text className="mt-1 text-sm text-muted">{user.email}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          className="mt-6 flex-row items-center gap-3 rounded-field bg-field px-4 py-4 active:opacity-70"
        >
          <MaterialCommunityIcons name="logout" size={22} color="#B33F01" />
          <Text className="text-base font-semibold text-accent">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
