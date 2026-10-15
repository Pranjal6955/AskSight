import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Blobs } from "@/components/Blobs";

// ponytail: no QueryLog table or history endpoint exists on the backend yet.
export default function HistoryScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <Blobs />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-ink">History</Text>
        <Text className="mt-2 text-center text-muted">
          Your past questions will appear here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
