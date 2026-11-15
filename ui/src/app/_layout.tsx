import "./global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AuthProvider, useAuth } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings";

// Hold the splash until the stored session has been checked, so a returning
// user never sees Login flash before Home.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { authReady, user } = useAuth();

  useEffect(() => {
    if (authReady) void SplashScreen.hideAsync().catch(() => {});
  }, [authReady]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FAF7F0" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
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
