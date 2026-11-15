import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusBanner } from "@/components/StatusBanner";
import { uploadImage, toFriendlyMessage, type UploadFile } from "@/lib/api";
import { announce } from "@/lib/a11y";

export default function PhotoPreviewScreen() {
  const params = useLocalSearchParams<{
    uri?: string;
    name?: string;
    type?: string;
    pick?: string;
  }>();
  const [photo, setPhoto] = useState<UploadFile | null>(
    params.uri
      ? {
          uri: params.uri,
          name: params.name ?? "asksight-photo.jpg",
          type: params.type ?? "image/jpeg",
        }
      : null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(false);
  const launched = useRef(false);

  useEffect(() => {
    if (params.pick === "1" && !launched.current) {
      launched.current = true;
      void choosePhoto();
    }
  }, [params.pick]);

  async function choosePhoto() {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        "Photo library access is off. You can enable it in your device settings.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        name: asset.fileName ?? "asksight-photo.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
    }
  }

  async function handleUsePhoto() {
    if (!photo || loading) return;
    setLoading(true);
    setElapsed(false);
    const timer = setTimeout(() => {
      setElapsed(true);
      announce("Uploading photo.");
    }, 3000);
    try {
      const image = await uploadImage(photo);
      router.replace({
        pathname: "/ask",
        params: { image_id: image.id },
      } as never);
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't upload that photo. Please try again.",
      );
      setError(message);
      announce(message);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-6">
        <View className="mx-auto w-full max-w-[560px]">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo preview"
            onPress={() => router.back()}
            className="mb-5 h-12 w-12 items-center justify-center rounded-full border-2 border-inputBorder bg-white"
          >
            <MaterialCommunityIcons name="close" size={25} color="#000000" />
          </Pressable>
          <AppText
            variant="hero"
            accessibilityRole="header"
            className="mb-2 text-ink"
          >
            Use this photo?
          </AppText>
          <AppText variant="bodyLarge" className="mb-5 text-muted">
            If the photo is blurry or dark, retake it for a better answer.
          </AppText>
          {error ? (
            <View className="mb-5 gap-3">
              <StatusBanner tone="error" message={error} />
              {error.includes("access is off") ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void Linking.openSettings()}
                  className="min-h-12 justify-center"
                >
                  <AppText variant="body" className="font-semibold text-ink">
                    Open Settings
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {photo ? (
            <Image
              source={{ uri: photo.uri }}
              accessibilityLabel="Your photo"
              accessible
              resizeMode="contain"
              className="mb-6 h-[min(48vh,420px)] w-full rounded-card bg-field"
            />
          ) : (
            <View className="mb-6 h-56 items-center justify-center rounded-card bg-field">
              <AppText variant="body" className="text-muted">
                Choose a photo to continue.
              </AppText>
            </View>
          )}
          <PrimaryButton
            label="Use Photo"
            loading={loading}
            loadingLabel={elapsed ? "Uploading photo…" : "Please wait…"}
            disabled={!photo}
            onPress={() => void handleUsePhoto()}
          />
          {loading ? (
            <AppText
              variant="body"
              accessibilityLiveRegion="polite"
              className="mt-3 text-center text-muted"
            >
              Uploading photo…
            </AppText>
          ) : null}
          <View className="mt-3 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={() => router.replace("/capture" as never)}
              className="min-h-14 flex-1 items-center justify-center rounded-field border-2 border-inputBorder bg-white px-3"
            >
              <AppText variant="bodyLarge" className="font-semibold text-ink">
                Retake
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void choosePhoto()}
              className="min-h-14 flex-1 items-center justify-center rounded-field border-2 border-inputBorder bg-white px-3"
            >
              <AppText variant="bodyLarge" className="font-semibold text-ink">
                Choose Another
              </AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
