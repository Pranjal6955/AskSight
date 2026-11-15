import { Redirect } from "expo-router";
import { Text, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";

// An unguarded anchor: the protected groups above it decide which of Login or
// the tabs are reachable, and this route sends the user to the right one.
export default function Index() {
  const { authReady, user } = useAuth();
  const { settings, ready: settingsReady } = useSettings();

  if (!authReady || !settingsReady) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text
          accessibilityLiveRegion="polite"
          className="text-xl font-semibold text-muted"
        >
          Opening AskSight…
        </Text>
      </View>
    );
  }

  return (
    <Redirect
      href={
        !user
          ? "/login"
          : settings.consentGiven
            ? "/(tabs)/home"
            : ("/consent" as never)
      }
    />
  );
}
