import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusBanner } from "@/components/StatusBanner";
import { announce } from "@/lib/a11y";
import { deleteAllHistory, toFriendlyMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clearCachedHistory } from "@/lib/historyCache";
import { useScreenReader } from "@/lib/useA11y";
import { useSettings, type Settings, type TextScale } from "@/lib/settings";

const SUPPORT_URL = "https://github.com/Pranjal6955/AskSight/issues";

function SettingsChoice<T extends string | number>({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: T;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => onSelect(value)}
      className={`touch-target min-h-12 flex-row items-center gap-3 rounded-field border-2 px-4 py-3 ${selected ? "border-brand bg-field" : "border-inputBorder bg-white"}`}
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? "border-brand" : "border-inputBorder"}`}
        importantForAccessibility="no-hide-descendants"
      >
        {selected ? <View className="h-3 w-3 rounded-full bg-brand" /> : null}
      </View>
      <AppText variant="bodyLarge" className="flex-1 text-ink">
        {label}
      </AppText>
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <AppText
      variant="section"
      accessibilityRole="header"
      className="mb-3 mt-8 text-ink"
    >
      {children}
    </AppText>
  );
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { settings, update } = useSettings();
  const screenReader = useScreenReader();
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [supportError, setSupportError] = useState("");
  const initials = user?.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function selectSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K],
    message: string,
  ) {
    update(key, value);
    announce(message);
  }

  function handleSignOut() {
    setConfirmSignOut(false);
    void signOut();
    router.replace("/login");
  }

  async function handleDeleteAllHistory() {
    setConfirmDeleteAll(false);
    setDeleteError("");
    setDeleteSuccess(false);
    setDeletingHistory(true);
    try {
      await deleteAllHistory();
      clearCachedHistory();
      setDeleteSuccess(true);
      announce("All questions, answers, and photos deleted.");
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't delete your history. Please try again.",
      );
      setDeleteError(message);
      announce(message);
    } finally {
      setDeletingHistory(false);
    }
  }

  async function openSupport() {
    setSupportError("");
    try {
      await Linking.openURL(SUPPORT_URL);
    } catch {
      const message = "We couldn't open the support page. Please try again.";
      setSupportError(message);
      announce(message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow px-6 pb-10 pt-8"
      >
        <View className="mx-auto w-full max-w-[560px]">
          <ScreenHeader
            title="Settings"
            subtitle="Manage how AskSight reads and speaks."
          />

          <SectionTitle>Account</SectionTitle>
          {user ? (
            <View
              className="flex-row items-center gap-4 rounded-card border-2 border-inputBorder bg-white p-5"
              accessible
              accessibilityLabel={`Signed in as ${user.name}, ${user.email}`}
            >
              <View
                className="h-16 w-16 items-center justify-center rounded-full bg-avatar"
                importantForAccessibility="no-hide-descendants"
              >
                <AppText variant="section" className="text-ink">
                  {initials}
                </AppText>
              </View>
              <View className="flex-1">
                <AppText variant="bodyLarge" className="font-bold text-ink">
                  {user.name}
                </AppText>
                <AppText variant="body" className="mt-1 text-muted">
                  {user.email}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText variant="bodyLarge" className="text-muted">
              Sign in to manage your account.
            </AppText>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out of your account"
            accessibilityHint="Asks you to confirm before signing out"
            accessibilityState={{ disabled: !user }}
            disabled={!user}
            onPress={() => setConfirmSignOut(true)}
            className={`touch-target mt-4 min-h-14 flex-row items-center justify-center gap-3 rounded-field border-2 bg-white px-6 py-4 ${user ? "border-error" : "border-inputBorder"}`}
          >
            <MaterialCommunityIcons
              name="logout"
              size={24}
              color={user ? "#B42318" : "#404040"}
              importantForAccessibility="no-hide-descendants"
            />
            <AppText
              variant="bodyLarge"
              className={`font-bold ${user ? "text-error" : "text-muted"}`}
            >
              Sign out
            </AppText>
          </Pressable>

          <SectionTitle>Reading &amp; listening</SectionTitle>
          <View className="gap-5 rounded-card border-2 border-inputBorder bg-white p-5">
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <AppText variant="bodyLarge" className="font-semibold text-ink">
                  Speak answers automatically
                </AppText>
                {screenReader ? (
                  <AppText variant="body" className="mt-1 text-muted">
                    Automatic speech is paused while a screen reader is active.
                  </AppText>
                ) : null}
              </View>
              <Switch
                accessibilityRole="switch"
                accessibilityLabel="Speak answers automatically"
                accessibilityState={{ checked: settings.speakAutomatically }}
                value={settings.speakAutomatically}
                onValueChange={(value) =>
                  selectSetting(
                    "speakAutomatically",
                    value,
                    `Speak answers automatically, ${value ? "on" : "off"}.`,
                  )
                }
                trackColor={{ false: "#737373", true: "#166534" }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View className="gap-2">
              <AppText variant="bodyLarge" className="font-semibold text-ink">
                Speech speed
              </AppText>
              <View className="gap-2">
                {(
                  [
                    [0.8, "Slow"],
                    [1, "Normal"],
                    [1.2, "Fast"],
                  ] as const
                ).map(([rate, label]) => (
                  <SettingsChoice
                    key={rate}
                    value={rate}
                    label={label}
                    selected={settings.speechRate === rate}
                    onSelect={(value) =>
                      selectSetting(
                        "speechRate",
                        value,
                        `Speech speed set to ${label}.`,
                      )
                    }
                  />
                ))}
              </View>
            </View>

            <View className="gap-2">
              <AppText variant="bodyLarge" className="font-semibold text-ink">
                Text size
              </AppText>
              <View className="gap-2">
                {(
                  [
                    ["system", "Follow system"],
                    ["large", "Large"],
                    ["xlarge", "Extra large"],
                  ] as const
                ).map(([scale, label]) => (
                  <SettingsChoice
                    key={scale}
                    value={scale}
                    label={label}
                    selected={settings.textScale === scale}
                    onSelect={(value) =>
                      selectSetting(
                        "textScale",
                        value as TextScale,
                        `Text size set to ${label}.`,
                      )
                    }
                  />
                ))}
              </View>
              <View className="rounded-field border-2 border-inputBorder bg-field p-4">
                <AppText variant="bodyLarge" className="font-semibold text-ink">
                  Sample text
                </AppText>
                <AppText variant="bodyLarge" className="mt-1 text-muted">
                  You can change the text size any time.
                </AppText>
              </View>
            </View>
          </View>

          <SectionTitle>Language</SectionTitle>
          <View className="gap-3 rounded-card border-2 border-inputBorder bg-white p-5">
            <AppText variant="bodyLarge" className="font-semibold text-ink">
              Spoken language
            </AppText>
            <SettingsChoice
              value="en-IN"
              label="English (India)"
              selected={settings.speechLanguage === "en-IN"}
              onSelect={(value) =>
                selectSetting(
                  "speechLanguage",
                  value,
                  "Spoken language set to English (India).",
                )
              }
            />
            <AppText variant="body" className="text-muted">
              Answers are currently written in English.
            </AppText>
          </View>

          <SectionTitle>Privacy &amp; data</SectionTitle>
          <View className="gap-4 rounded-card border-2 border-inputBorder bg-white p-5">
            <AppText variant="bodyLarge" className="text-ink">
              Photos, questions, and answers are stored until you delete them.
              Generated speech is not stored. If you record a question, the
              audio is sent to Sarvam to transcribe it. Answer text is sent to
              Sarvam when spoken audio is requested.
            </AppText>
            {deleteError ? (
              <StatusBanner tone="error" message={deleteError} />
            ) : null}
            {deleteSuccess ? (
              <StatusBanner
                tone="success"
                message="All questions, answers, and photos deleted."
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: deletingHistory,
                busy: deletingHistory,
              }}
              disabled={deletingHistory}
              onPress={() => setConfirmDeleteAll(true)}
              className="touch-target min-h-14 items-center justify-center rounded-field border-2 border-error px-5 py-3"
            >
              <AppText variant="bodyLarge" className="font-bold text-error">
                {deletingHistory ? "Deleting history…" : "Delete All History"}
              </AppText>
            </Pressable>
          </View>

          <SectionTitle>About AskSight</SectionTitle>
          <View className="gap-4 rounded-card border-2 border-inputBorder bg-white p-5">
            <View className="flex-row items-start gap-3">
              <MaterialCommunityIcons
                name="eye-outline"
                size={28}
                color="#000000"
                importantForAccessibility="no-hide-descendants"
              />
              <AppText variant="bodyLarge" className="flex-1 text-ink">
                AskSight helps blind and low-vision users understand their
                surroundings through image descriptions and questions.
              </AppText>
            </View>
            <AppText variant="body" className="text-muted">
              Version {Constants.expoConfig?.version ?? "Unknown"}
            </AppText>
            <AppText variant="body" className="text-muted">
              Last model version: {settings.lastModelVersion ?? "Not available"}
            </AppText>
            {__DEV__ && settings.lastModelVersion === "mock-0.0.0" ? (
              <StatusBanner
                tone="warning"
                message="Demo mode — not a real model."
              />
            ) : null}
            <AppText variant="bodyLarge" className="text-ink">
              Answers can be wrong. Please verify important information. Ask
              questions about what is visible in your photo. Answers are
              currently written in English.
            </AppText>
            {supportError ? (
              <StatusBanner tone="error" message={supportError} />
            ) : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="AskSight support page"
              onPress={() => void openSupport()}
              className="touch-target min-h-12 flex-row items-center gap-2 self-start rounded-field border-2 border-inputBorder px-4 py-3"
            >
              <AppText variant="bodyLarge" className="font-bold text-ink">
                Help &amp; support
              </AppText>
              <MaterialCommunityIcons
                name="open-in-new"
                size={20}
                color="#000000"
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="You will need to sign in again to use AskSight."
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        destructive
        onConfirm={handleSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
      <ConfirmDialog
        visible={confirmDeleteAll}
        title="Delete all history?"
        message="This deletes every question, answer, and photo in your history. It cannot be undone."
        confirmLabel="Delete All"
        cancelLabel="Keep My History"
        destructive
        onConfirm={() => void handleDeleteAllHistory()}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </SafeAreaView>
  );
}
