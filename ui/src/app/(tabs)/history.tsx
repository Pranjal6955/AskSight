import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Blobs } from "@/components/Blobs";

// ponytail: no QueryLog table or history endpoint exists on the backend yet.
export default function HistoryScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <Blobs />
      <View className="flex-1 px-6 pt-6">
        <Text
          className="text-4xl font-bold text-ink"
          accessibilityRole="header"
        >
          History
        </Text>
        <View
          className="mt-8 rounded-card bg-field p-6 touch-target items-center justify-center"
          accessibilityLabel="No history available yet"
        >
          <Text className="text-base text-muted text-center">
            Your past questions will appear here.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}