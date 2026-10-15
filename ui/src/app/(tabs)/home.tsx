import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Blobs } from "@/components/Blobs";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth";

// Feature not yet implemented - these are the designed actions
const ACTIONS = [
  {
    id: "camera",
    title: "Ask with Camera",
    subtitle: "Take a photo and get an AI description of your surroundings",
    icon: "camera" as const,
    iconOff: "camera-off-outline" as const,
    tileBg: "bg-tile-green",
    tileBorder: "border-tile-green",
    glyph: "#FDFBF4",
    cardBg: "bg-card-green",
    permission: "camera",
    permissionLabel:
      "Camera access is needed to take photos for AI descriptions",
  },
  {
    id: "voice",
    title: "Ask with Voice",
    subtitle: "Speak your question and hear the response",
    icon: "microphone" as const,
    iconOff: "microphone-off" as const,
    tileBg: "bg-tile-orange",
    tileBorder: "border-tile-orange",
    glyph: "#B33F01",
    cardBg: "bg-card-orange",
    permission: "microphone",
    permissionLabel:
      "Microphone access is needed to record your voice questions",
  },
  {
    id: "text",
    title: "Ask with Text",
    subtitle: "Type your question and read the response",
    icon: "file-document" as const,
    iconOff: "file-document-outline" as const,
    tileBg: "bg-tile-grey",
    tileBorder: "border-tile-grey",
    glyph: "#3C424D",
    cardBg: "bg-card-grey",
    permission: null,
    permissionLabel: null,
  },
] as const;

type ActionId = (typeof ACTIONS)[number]["id"];
type ActionStatus = "idle" | "loading" | "permission-denied" | "error";

function initials(name?: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ActionCard({
  action,
  status,
  onPress,
}: {
  action: (typeof ACTIONS)[number];
  status: ActionStatus;
  onPress: () => void;
}) {
  const isDisabled = status !== "idle";
  const loading = status === "loading";
  const permissionDenied = status === "permission-denied";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      accessibilityLabel={
        loading
          ? `${action.title}, loading`
          : permissionDenied
            ? `${action.title}, permission denied. ${action.permissionLabel}`
            : `${action.title}. ${action.subtitle}. Double tap to activate.`
      }
      accessibilityHint={
        permissionDenied
          ? "Enable permission in settings to use this feature"
          : loading
            ? "Please wait"
            : "Double tap to activate"
      }
      disabled={isDisabled}
      onPress={onPress}
      className={`flex-row items-center rounded-card p-4 ${action.cardBg} touch-target focus-visible:outline-3 border-2 border-transparent focus-visible:outline focus-visible:outline-focus disabled:opacity-60 ${
        permissionDenied ? "border-error" : ""
      }`}
      hitSlop={8}
    >
      <View
        className={`h-16 w-16 items-center justify-center rounded-2xl ${action.tileBg}`}
        importantForAccessibility="no-hide-descendants"
      >
        {loading ? (
          <MaterialCommunityIcons
            name={action.icon}
            size={30}
            color={action.glyph}
            accessibilityHidden={true}
          />
        ) : permissionDenied ? (
          <MaterialCommunityIcons
            name={action.iconOff}
            size={30}
            color={action.glyph}
            accessibilityHidden={true}
          />
        ) : (
          <MaterialCommunityIcons
            name={action.icon}
            size={30}
            color={action.glyph}
            accessibilityHidden={true}
          />
        )}
      </View>
      <View className="ml-4 min-w-0 flex-1">
        <Text
          className="truncate text-lg font-bold text-ink"
          accessibilityRole="header"
        >
          {action.title}
        </Text>
        <Text className="mt-1 truncate text-sm text-muted" numberOfLines={2}>
          {permissionDenied
            ? `Permission denied. ${action.permissionLabel}. Tap to retry after granting permission.`
            : loading
              ? "Preparing..."
              : action.subtitle}
        </Text>
      </View>
      {loading ? (
        <MaterialCommunityIcons
          name="refresh"
          size={24}
          color="#5C6168"
          accessibilityHidden={true}
        />
      ) : permissionDenied ? (
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={24}
          color="#B33F01"
          accessibilityHidden={true}
        />
      ) : (
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color="#5C6168"
          accessibilityHidden={true}
        />
      )}
    </Pressable>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0] ?? "";

  // In a real app, these would come from permission hooks (expo-camera, expo-av)
  // For now, we demonstrate the UI states
  const [actionStatus, setActionStatus] = useState<
    Record<ActionId, ActionStatus>
  >({
    camera: "idle",
    voice: "idle",
    text: "idle",
  });

  function handleActionPress(id: ActionId) {
    const action = ACTIONS.find((a) => a.id === id);
    if (!action) return;

    // Simulate permission check / loading
    if (action.permission) {
      setActionStatus((prev: Record<ActionId, ActionStatus>) => ({
        ...prev,
        [id]: prev[id] === "permission-denied" ? "idle" : "loading",
      }));

      // Simulate async operation
      setTimeout(() => {
        setActionStatus((prev: Record<ActionId, ActionStatus>) => ({
          ...prev,
          [id]: Math.random() > 0.5 ? "idle" : "permission-denied",
        }));
      }, 1500);
    } else {
      setActionStatus((prev: Record<ActionId, ActionStatus>) => ({
        ...prev,
        [id]: "loading",
      }));
      setTimeout(() => {
        setActionStatus((prev: Record<ActionId, ActionStatus>) => ({
          ...prev,
          [id]: "idle",
        }));
      }, 1000);
    }
  }

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
          <View
            className="touch-target h-11 w-11 items-center justify-center rounded-full bg-avatar"
            accessibilityLabel={`User profile, ${user?.name ?? "Unknown"}`}
          >
            <Text className="text-sm font-bold text-brand-deep">
              {initials(user?.name)}
            </Text>
          </View>
        </View>

        <View className="mt-10" accessibilityLiveRegion="polite">
          <Text
            className="text-4xl font-bold text-ink"
            accessibilityRole="header"
          >
            {firstName ? `Hello, ${firstName}!` : "Hello!"}
          </Text>
          <Text className="mt-2 text-lg text-muted">
            How can I help you today?
          </Text>
        </View>

        <View className="mt-10 gap-4">
          <Text
            className="text-lg font-semibold text-ink"
            accessibilityRole="header"
          >
            Ask a question
          </Text>
          {ACTIONS.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              status={actionStatus[action.id]}
              onPress={() => handleActionPress(action.id)}
            />
          ))}
        </View>

        {/* Recent activity placeholder */}
        <View className="mt-12 gap-4">
          <View className="flex-row items-center justify-between">
            <Text
              className="text-lg font-semibold text-ink"
              accessibilityRole="header"
            >
              Recent activity
            </Text>
          </View>
          <View
            className="touch-target items-center justify-center rounded-card bg-field p-6"
            accessibilityLabel="No recent activity yet"
          >
            <Text className="text-center text-base text-muted">
              Your recent questions will appear here
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}