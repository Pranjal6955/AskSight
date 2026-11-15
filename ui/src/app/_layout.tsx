import "./global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AuthProvider, useAuth } from "@/lib/auth";
import { SettingsProvider, useSettings } from "@/lib/settings";

// Hold the splash until the stored session has been checked, so a returning
// user never sees Login flash before Home.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { authReady, user } = useAuth();
  const { settings, ready: settingsReady } = useSettings();

  useEffect(() => {
    if (authReady && settingsReady)
      void SplashScreen.hideAsync().catch(() => {});
  }, [authReady, settingsReady]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FAF7F0" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Protected guard={!!user && settingsReady}>
        <Stack.Protected guard={!settings.consentGiven}>
          <Stack.Screen name="consent" />
        </Stack.Protected>
        <Stack.Protected guard={settings.consentGiven}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="capture"
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="photo-preview"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="ask" options={{ presentation: "modal" }} />
          <Stack.Screen name="transcript" options={{ presentation: "modal" }} />
          <Stack.Screen name="answer" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="history/[id]"
            options={{ presentation: "modal" }}
          />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SettingsProvider>
  );
}
