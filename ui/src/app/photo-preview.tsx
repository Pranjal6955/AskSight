import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusBanner } from "@/components/StatusBanner";
import {
  ApiError,
  uploadImage,
  toFriendlyMessage,
  type UploadFile,
} from "@/lib/api";
import { announce } from "@/lib/a11y";
import {
  clearPendingPhoto,
  getPendingPhoto,
  setPendingPhoto,
} from "@/lib/pendingPhoto";

export default function PhotoPreviewScreen() {
  const params = useLocalSearchParams<{
    uri?: string;
    preview_uri?: string;
    name?: string;
    type?: string;
    pick?: string;
  }>();
  const [photo, setPhoto] = useState<UploadFile | null>(
    getPendingPhoto() ??
      (params.uri
        ? {
            uri: params.uri,
            previewUri: params.preview_uri,
            name: params.name ?? "asksight-photo.jpg",
            type: params.type ?? "image/jpeg",
          }
        : null),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [retryableUpload, setRetryableUpload] = useState(true);
  const launched = useRef(false);

  useEffect(() => {
    if (params.pick === "1" && !launched.current) {
      launched.current = true;
      void choosePhoto();
    }
  }, [params.pick]);

  async function choosePhoto() {
    setError("");
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
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
        setUploadFailed(false);
        setRetryableUpload(true);
        setPhoto({
          uri: asset.uri,
          previewUri: asset.uri,
          name: asset.fileName ?? "asksight-photo.jpg",
          type: asset.mimeType ?? "image/jpeg",
        });
      }
    } catch {
      setError("We couldn't open your photo library. Please try again.");
    }
  }

  async function handleUsePhoto() {
    if (!photo || loading) return;
    setUploadFailed(false);
    setPendingPhoto(photo);
    setLoading(true);
    setElapsed(false);
    const timer = setTimeout(() => {
      setElapsed(true);
      announce("Uploading photo.");
    }, 3000);
    try {
      const image = await uploadImage(photo);
      clearPendingPhoto();
      router.replace({
        pathname: "/ask",
        params: {
          image_id: image.id,
          photo_uri: photo.previewUri ?? photo.uri,
        },
      } as never);
    } catch (cause) {
      const message = toFriendlyMessage(
        cause,
        "We couldn't upload that photo. Please try again.",
      );
      setError(message);
      setUploadFailed(true);
      setRetryableUpload(
        !(cause instanceof ApiError && [413, 415, 422].includes(cause.status)),
      );
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
            onPress={() => {
              clearPendingPhoto();
              router.back();
            }}
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
              source={{ uri: photo.previewUri ?? photo.uri }}
              accessibilityLabel="Your photo"
              accessible
              resizeMode="contain"
              onError={() =>
                setError(
                  "We couldn't display this photo. Please choose it again.",
                )
              }
              style={{
                height: 320,
                width: "100%",
                marginBottom: 24,
                borderRadius: 20,
                backgroundColor: "#F2F2F2",
              }}
            />
          ) : (
            <View className="mb-6 h-56 items-center justify-center rounded-card bg-field">
              <AppText variant="body" className="text-muted">
                Choose a photo to continue.
              </AppText>
            </View>
          )}
          <PrimaryButton
            label={
              uploadFailed
                ? retryableUpload
                  ? "Try Again"
                  : "Choose Another"
                : "Use Photo"
            }
            loading={loading}
            loadingLabel={elapsed ? "Uploading photo…" : "Please wait…"}
            disabled={!photo}
            onPress={() =>
              uploadFailed && !retryableUpload
                ? void choosePhoto()
                : void handleUsePhoto()
            }
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
              onPress={() => {
                clearPendingPhoto();
                router.replace("/capture" as never);
              }}
              className="min-h-14 flex-1 items-center justify-center rounded-field border-2 border-inputBorder bg-white px-3"
            >
              <AppText variant="bodyLarge" className="font-semibold text-ink">
                Retake
              </AppText>
            </Pressable>
            {uploadFailed && !retryableUpload ? null : (
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
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
