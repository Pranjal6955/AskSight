import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Blobs } from "@/components/Blobs";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth";

// The backend has no /ask, upload or audio endpoints yet, so these cards are
// the full extent of the feature.
const ACTIONS = [
  {
    title: "Ask with Camera",
    subtitle: "Take a photo and get an AI description",
    icon: "camera" as const,
    tile: "bg-tile-green",
    glyph: "#FDFBF4",
    card: "bg-card-green",
  },
  {
    title: "Ask with Voice",
    subtitle: "Speak your question",
    icon: "microphone" as const,
    tile: "bg-tile-orange",
    glyph: "#B33F01",
    card: "bg-card-orange",
  },
  {
    title: "Ask with Text",
    subtitle: "Type your question",
    icon: "file-document" as const,
    tile: "bg-tile-grey",
    glyph: "#3C424D",
    card: "bg-card-grey",
  },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0] ?? "";

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <Blobs />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between">
          <BrandLogo compact />
          <View className="h-11 w-11 items-center justify-center rounded-full bg-avatar">
            <Text className="text-sm font-bold text-brand-deep">
              {initials(user?.name)}
            </Text>
          </View>
        </View>

        <Text className="mt-10 text-4xl font-bold text-ink">
          {firstName ? `Hello, ${firstName}!` : "Hello!"}
        </Text>
        <Text className="mt-2 text-lg text-muted">
          How can I help you today?
        </Text>

        <View className="mt-10 gap-4">
          {ACTIONS.map((action) => (
            <View
              key={action.title}
              className={`flex-row items-center rounded-card p-4 ${action.card}`}
            >
              <View
                className={`h-16 w-16 items-center justify-center rounded-2xl ${action.tile}`}
              >
                <MaterialCommunityIcons
                  name={action.icon}
                  size={30}
                  color={action.glyph}
                />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-ink">
                  {action.title}
                </Text>
                <Text className="mt-1 text-sm text-muted">
                  {action.subtitle}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color="#3C424D"
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function initials(name?: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
