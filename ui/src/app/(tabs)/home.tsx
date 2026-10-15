import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

const waysToAsk = [
  {
    title: "Ask with Camera",
    description: "Take a photo and get an AI description of your surroundings",
    icon: "camera-outline" as const,
    titleColor: "text-white",
    descriptionColor: "text-white",
    iconColor: "#FFFFFF",
  },
  {
    title: "Ask with Voice",
    description: "Speak your question and hear the response",
    icon: "microphone-outline" as const,
    titleColor: "text-ink",
    descriptionColor: "text-muted",
    iconColor: "#005B48",
  },
  {
    title: "Ask with Text",
    description: "Type your question and read the response",
    icon: "keyboard-outline" as const,
    titleColor: "text-ink",
    descriptionColor: "text-muted",
    iconColor: "#005B48",
  },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0];
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
                className="h-14 w-14 items-center justify-center rounded-full border-2 border-brand bg-card-green"
                accessibilityLabel={`Signed in as ${user?.name}`}
              >
                <Text className="text-xl font-bold text-brand">{initials}</Text>
              </View>
            ) : null}
          </View>

          <View className="mb-8">
            <Text
              accessibilityRole="header"
              className="text-4xl font-bold leading-10 text-ink"
            >
              {firstName ? `Hello, ${firstName}!` : "Hello there!"}
            </Text>
            <Text className="mt-3 text-2xl font-semibold leading-8 text-ink">
              How can I help you today?
            </Text>
            <Text className="mt-3 text-lg leading-7 text-muted">
              Choose how you would like to explore what is around you.
            </Text>
          </View>

          <View className="gap-4">
            {waysToAsk.map((way, index) => (
              <View
                key={way.title}
                className={`min-h-[132px] flex-row items-center gap-4 rounded-card border-2 p-5 ${
                  index === 0
                    ? "border-brand bg-brand"
                    : "border-inputBorder bg-white"
                }`}
                accessibilityLabel={`${way.title}. ${way.description}`}
              >
                <View
                  className={`h-14 w-14 items-center justify-center rounded-full ${
                    index === 0 ? "bg-brand-deep" : "bg-card-green"
                  }`}
                  importantForAccessibility="no-hide-descendants"
                >
                  <MaterialCommunityIcons
                    name={way.icon}
                    size={30}
                    color={way.iconColor}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className={`text-2xl font-bold leading-8 ${way.titleColor}`}
                  >
                    {way.title}
                  </Text>
                  <Text
                    className={`mt-2 text-lg leading-7 ${way.descriptionColor}`}
                  >
                    {way.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View className="mt-8 flex-row items-start gap-3 rounded-card border-2 border-inputBorder bg-white p-5">
            <MaterialCommunityIcons
              name="information-outline"
              size={26}
              color="#005B48"
              importantForAccessibility="no-hide-descendants"
            />
            <Text className="flex-1 text-lg leading-7 text-muted">
              AskSight is designed to make everyday surroundings easier to
              understand.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
