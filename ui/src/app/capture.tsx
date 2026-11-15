import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { StatusBanner } from "@/components/StatusBanner";
import { announce } from "@/lib/a11y";

export default function CaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState("");
  const camera = useRef<CameraView>(null);

  useEffect(() => {
    if (permission?.granted)
      announce(
        "Camera ready. Point away from you, about an arm's length from what you want to see. Tap anywhere to take a photo.",
      );
  }, [permission?.granted]);

  async function continueToCamera() {
    setError("");
    try {
      if (!permission?.granted) await requestPermission();
    } catch {
      setError("We couldn't request camera access. Please try again.");
    }
  }

  async function capture() {
    if (taking || !camera.current) return;
    setError("");
    setTaking(true);
    try {
      const result = await camera.current.takePictureAsync({
        quality: 0.8,
        imageType: "jpg",
      });
      if (result?.uri) {
        announce("Photo taken.");
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        router.replace({
          pathname: "/photo-preview",
          params: {
            uri: result.uri,
            name: "asksight-photo.jpg",
            type: "image/jpeg",
          },
        } as never);
      }
    } catch {
      const message = "We couldn't take that photo. Please try again.";
      setError(message);
      announce(message);
    } finally {
      setTaking(false);
    }
  }

  if (!permission?.granted) {
    const denied = permission?.canAskAgain === false;
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-6">
          <AppText
            variant="hero"
            accessibilityRole="header"
            className="mb-4 text-ink"
          >
            Use your camera
          </AppText>
          <AppText variant="bodyLarge" className="mb-8 text-muted">
            AskSight needs the camera to see what you want to ask about.
          </AppText>
          {error ? (
            <View className="mb-5">
              <StatusBanner tone="error" message={error} />
            </View>
          ) : null}
          {denied ? (
            <AppText variant="bodyLarge" className="mb-6 text-error">
              Camera access is off. You can enable it in your device settings,
              or choose a photo from your library.
            </AppText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={
              denied ? () => void Linking.openSettings() : continueToCamera
            }
            className="mb-3 min-h-14 items-center justify-center rounded-field bg-brand px-5"
          >
            <AppText variant="bodyLarge" className="font-bold text-white">
              {denied ? "Open Settings" : "Continue"}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/photo-preview?pick=1" as never)}
            className="mb-3 min-h-14 items-center justify-center rounded-field border-2 border-inputBorder bg-white px-5"
          >
            <AppText variant="bodyLarge" className="font-bold text-ink">
              Choose from Library
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            className="min-h-12 items-center justify-center"
          >
            <AppText variant="body" className="text-muted">
              Not now
            </AppText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={camera}
        className="flex-1"
        facing="back"
        enableTorch={torch}
        pointerEvents="none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tap anywhere to take a photo"
        accessibilityHint="Captures what the camera can see."
        disabled={taking}
        onPress={() => void capture()}
        className="absolute inset-0"
      />
      <SafeAreaView
        edges={["top"]}
        className="absolute left-0 right-0 top-0 px-5"
      >
        <View className="mt-2 flex-row items-start justify-between gap-3">
          {error ? (
            <View className="flex-1">
              <StatusBanner tone="error" message={error} />
            </View>
          ) : (
            <View className="flex-1" />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            onPress={() => router.back()}
            className="h-14 w-14 items-center justify-center rounded-full bg-black/70"
          >
            <MaterialCommunityIcons name="close" size={30} color="white" />
          </Pressable>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={["bottom"]} className="bg-black px-5 pb-3 pt-4">
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              torch ? "Turn flashlight off" : "Turn flashlight on"
            }
            accessibilityState={{ selected: torch }}
            onPress={() => {
              setTorch((v) => !v);
              announce(torch ? "Flashlight off." : "Flashlight on.");
            }}
            className="min-h-14 min-w-14 items-center justify-center rounded-full bg-white/15"
          >
            <MaterialCommunityIcons
              name={torch ? "flashlight" : "flashlight-off"}
              size={27}
              color="white"
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled: taking, busy: taking }}
            disabled={taking}
            onPress={() => void capture()}
            className="h-28 w-28 items-center justify-center rounded-full border-[6px] border-white"
          >
            <View className="h-[76px] w-[76px] rounded-full bg-white" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose from Library"
            onPress={() => router.replace("/photo-preview?pick=1" as never)}
            className="min-h-14 min-w-14 items-center justify-center rounded-full bg-white/15"
          >
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={27}
              color="white"
            />
          </Pressable>
        </View>
        <AppText variant="body" className="mt-3 text-center text-white">
          Tap anywhere to take a photo
        </AppText>
      </SafeAreaView>
    </View>
  );
}
